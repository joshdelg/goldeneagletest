const fs = require('fs');
const got = require('got');
const cheerio = require('cheerio');
const regression = require('regression');

const hitw = "NIKE HOLE IN THE WALL XC INVITATIONAL";

const secondsToReadable = (secs) => {
    const mins = Math.floor(secs / 60);
    const seconds = Math.round(secs % 60);
    return `${mins}:${seconds >= 10 ? seconds : ("0" + seconds)}`;
}

const readableToSeconds = (read) => {
    const [mins, secs] = read.split(':');
    return (parseFloat(mins) * 60) + (parseFloat(secs));
}

// Use downloaded hitw {other meets} data
const loadRaceResults = async() => {
    try {
        const data = await fs.promises.readFile('./saved_data/hw_varsity_trunc.json', 'utf-8');
        return JSON.parse(data).results;
    } catch(err) {
        console.log(err);
        return;
    }
}

const getAthletePR = async(athleteId, season) => {
    try {
        const response = await got('https://www.athletic.net/api/v1/General/GetRankings', {
            searchParams: {
                athleteId: athleteId,
                sport: "XC",
                seasonId: season,
                truncate: false
            }
        });

        const rankings = JSON.parse(response.body);
        let athletePr = 0;
        rankings.forEach((rank) => {
            if(rank.Meters === 5000) {
                athletePr = rank.SortValue;
                return;
            }
        })
        return athletePr;
    } catch (err) {
        console.log("Error fetching PR.", err);
        return null;
    }
}

// ?? Main Refactor as 1 function
const getAthleteData = async(athleteId, season, meetToRemove) => {
    try {
        const response = await got(`https://www.athletic.net/CrossCountry/Athlete.aspx?AID=${athleteId}`);
        const $ = cheerio.load(response.body);
        const allTimes = $(`div[id*="S-${season}"]`).children().last();
        let season5kTable;

        allTimes.children().each((i, el) => {
            if(el.name === 'h5' && $(el).text() === '5,000 Meters') {
                season5kTable = $(el).next();
            }
        })

        let athleteResults = [];
        $('tr', season5kTable).each((i, el) => {
            const placeElement = $(el).children()[0];
            const resultElement = $(el).children()[1];
            const dateElement = $(el).children()[2];
            const meetElement = $(el).children()[3];
            const meetLink = $('a', meetElement).attr().href;

            athleteResults.push({
                place: parseInt($(placeElement).text()),
                timeReadable: $(resultElement).text().replace(/[a-zA-Z]{2}/g, ""),
                time: readableToSeconds($(resultElement).text().replace(/[a-zA-Z]{2}/g, "")),
                date: $(dateElement).text(),
                meetName: $(meetElement).text(),
                meetId: meetLink.match(/\d+/g)[0],
                raceId: meetLink.match(/\d+/g)[1],
                isSR: $(resultElement).text().includes("SR") || $(resultElement).text().includes("PR"),
                isPR: $(resultElement).text().includes("PR")
            });
        })
        console.log(athleteResults);

        // TODO Compute time-based aggregates based on dataset
    } catch (err) {
        console.log("Error getting athlete data", err);
    }
}

// Todo remove multiple meets
// ! Todo use athleteId to get school and with selector S-{season} T-{schoolID} remove unattached seasons
const getAverageTime = async(athleteId, season, meetToRemove) => {
    try {
        const response = await got(`https://www.athletic.net/CrossCountry/Athlete.aspx?AID=${athleteId}`);
        const $ = cheerio.load(response.body);
        const allTimes = $(`div[id*="S-${season}"]`).children().last();
        let season5kTable;
        allTimes.children().each((i, el) => {
            if(el.name === 'h5' && $(el).text() === '5,000 Meters') {
                season5kTable = $(el).next();
            }
        })

        const seasonText = season5kTable.text();
        let times;
        if(meetToRemove) {
            const meetIndex = seasonText.indexOf(meetToRemove);
            const p1 = seasonText.substr(0, meetIndex - 17);
            const p2 = seasonText.substr(meetIndex);
            times = (p1 + p2).match(/[0-9]+:[0-9]+/g);
        } else {
            times = seasonText.match(/[0-9]+:[0-9]+/g);
        }

        let timesSeconds = times.map(t => parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1]));
        let averageTimeSeconds = timesSeconds.reduce((agg, val) => agg + val) / timesSeconds.length;
        return averageTimeSeconds;
    } catch (err) {
        console.log("Error computing average time");
        console.log(err);
        return null;
    }
}

const getAverageTimeBeforeMeet = async(athleteId, season, cutoffMeet) => {
    try {
        const response = await got(`https://www.athletic.net/CrossCountry/Athlete.aspx?AID=${athleteId}`);
        const $ = cheerio.load(response.body);
        const allTimes = $(`div[id*="S-${season}"]`).children().last();

        let season5kTable;
        allTimes.children().each((i, el) => {
            if(el.name === 'h5' && $(el).text() === '5,000 Meters') {
                season5kTable = $(el).next();
            }
        })

        const seasonText = season5kTable.text();
        const meetIndex = seasonText.indexOf(cutoffMeet);
        const p1 = seasonText.substr(0, meetIndex - 17);
        //console.log("Times before: ", p1);
        let times = p1.match(/[0-9]+:[0-9]+/g);

        let timesSeconds = times.map(t => parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1]));
        let averageTimeSeconds = timesSeconds.reduce((agg, val) => agg + val) / timesSeconds.length;
        let avgTimeReadable = `${Math.floor(averageTimeSeconds / 60)}:${Math.round(averageTimeSeconds % 60)}`;
        return averageTimeSeconds;
    } catch (err) {
        console.log(err);
    }
}

// TODO Avg. time for invites
// ? What is the qualification for invites?

// TODO Get athlete Avg. last season

// TODO Regression for each individually, all at once (check/uncheck at will)
const getRaceResults = async() => {
    try {
        const data = await fs.promises.readFile('./saved_data/hw_varsity_trunc.json', 'utf-8');
        return JSON.parse(data).results;
    } catch(err) {
        console.log(err);
    }
}

const processData = async(raceResults, writeToFile) => {
    let athleteData = [];
    for(const res of raceResults) {
        const pr = await getAthletePR(res.AthleteID, 2019);
        const avgTime = await getAverageTime(res.AthleteID, 2019, "");
        const avgTimeNoHITW = await getAverageTime(res.AthleteID, 2019, hitw);
        const avgTimeBeforeHITW = await getAverageTimeBeforeMeet(res.AthleteID, 2019, hitw);
        if(pr && avgTime && avgTimeNoHITW && avgTimeBeforeHITW) {
            athleteData.push({
                name: (res.FirstName + " "+ res.LastName),
                time: res.SortValue,
                pr: pr,
                grade: res.Grade,
                gender: res.Gender,
                athleteId: res.AthleteID,
                averageTime: avgTime,
                avgTimeNoHITW: avgTimeNoHITW,
                avgTimeBeforeHITW: avgTimeBeforeHITW
            });
        }
    }

    if(writeToFile) {
        try {
            const fileWriteString = athleteData.reduce((prev, curr) => (prev + curr.name + "," + curr.time + "," + curr.pr + "," + curr.averageTime + "," + curr.avgTimeNoHITW +"," + curr.avgTimeBeforeHITW + "\n"), 
                "Name,Race Time,PR,Average Time,Avg Time No Race,Avg Time Before Race\n");
            await fs.promises.writeFile('./output_data/hw_varsity_models.csv', fileWriteString, 'utf-8');
        } catch(err) {
            console.log("Error writing output file :(");
            console.log(err);
        }
    }
    return athleteData;
}

const buildRegressionModel = (data) => {
    // time vs pr
    const model1 = regression.linear(data.map((athlete) => [athlete.pr, athlete.time]));
    // time vs avg time
    const model2 = regression.linear(data.map((athlete) => [athlete.averageTime, athlete.time]));
    // time vs avg time race removed
    const model3 = regression.linear(data.map((athlete) => [athlete.avgTimeNoHITW, athlete.time]));
    // time vs avg time before race
    const model4 = regression.linear(data.map((athlete) => [athlete.avgTimeBeforeHITW, athlete.time]));

    console.log("--------------");
    console.log("Time vs. Pr Model: ", model1);
    console.log("-------------");
    console.log("Time vs Avg. Time", model2);
    console.log("--------------");
    console.log("Time vs. Avg Time without Race", model3);
    console.log("--------------");
    console.log("Time vs. Avg Time before Race", model4);
}

getAthleteData(13955486, 2020, "").then(t => console.log((secondsToReadable(t))));

//getAverageTime(13955486, 2021, "").then((t) => console.log(secondsToReadable(t)));
//getRaceResults().then((results) => processData(results, true).then(d => buildRegressionModel(d)));
//getAthletePR(13955486, 2021).then((pr) => console.log(secondsToReadable(pr)));
//getAverageTime(9711766, 2019, hitw).then((t) => console.log(secondsToReadable(t)));