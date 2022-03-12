const fs = require('fs');
const got = require('got');
const cheerio = require('cheerio');

// ! Download data + Fake user agent and other headers as best you can
// ! Request now needs anettoken

const getAthletePR = async(athleteId) => {
    const response = await got('https://www.athletic.net/api/v1/General/GetRankings', {
        searchParams: {
            athleteId: athleteId,
            sport: "XC",
            seasonId: 2019,
            truncate: false
        }
    });

    const rankings = JSON.parse(response.body);
    let athletePr = 0;
    rankings.every((ranking) => {
        if(ranking.Meters === 5000) {
            athletePr = ranking.SortValue;
            return false;
        }
        return true;
    });
    return athletePr;
};

const getAverageTime = async(athleteId) => {

    try {
        const response = await got(`https://www.athletic.net/CrossCountry/Athlete.aspx?AID=${athleteId}`);
        const $ = cheerio.load(response.body);
        const allTimes = $('div[id*="S-2019"]').children().last();

        let season5kTable;
        allTimes.children().each((i, el) => {
            if(el.name === 'h5' && $(el).text() === '5,000 Meters') {
                season5kTable = $(el).next();
            }
        })

        const seasonText = season5kTable.text();
        //const removedMeet = 'Bellevue Cross Country Invite';
        const removedMeet = 'NIKE HOLE IN THE WALL XC INVITATIONAL';
        //const meetIndex = seasonText.indexOf(removedMeet);
        /*const p1 = seasonText.substr(0, meetIndex - 17);
        const p2 = seasonText.substr(meetIndex);
        let times = (p1 + p2).match(/[0-9]+:[0-9]+/g);
        //let times = seasonText.match(/[0-9]+:[0-9]+/g);
        console.log(times);*/

        // Get average of time before meet
        const meetIndex = seasonText.indexOf(removedMeet);
        const timesBefore = seasonText.substring(0, meetIndex - 17);
        let times = timesBefore.match(/[0-9]+:[0-9]+/g);


        let timesSeconds = times.map(t => parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1]));
        let averageTimeSeconds = timesSeconds.reduce((agg, val) => agg + val) / timesSeconds.length;
        let avgTimeReadable = `${Math.floor(averageTimeSeconds / 60)}:${Math.round(averageTimeSeconds % 60)}`;
        console.log(avgTimeReadable);
        return averageTimeSeconds;
    } catch (err) {
        console.log(err);
    }
}

const getRaceResults = async() => {
    /* // ! Trying not to trigger the athletic.net devs lmao
    try {
        const response = await got.post('https://www.athletic.net/api/v1/Meet/GetResultsData', {
            json: {
                meetId: 165216,
                divId: 682005,
                sport: "xc"
            }
        });
    } catch (err) {
        console.log(err);
    }


    return JSON.parse(response.body).results;*/

    try {
        //const data = await fs.promises.readFile('./saved_data/hw_varsity.json', 'utf-8');
        const data = await fs.promises.readFile('./saved_data/hw_varsity.json', 'utf-8');
        return JSON.parse(data).results;
    } catch (err) {
        console.log(err);
        return;
    }
}

let times = [];

const scrape = async() => {
    console.group("Obtaining race results");
    const results = await getRaceResults();
    for(const result of results) {
        console.log(`Athlete ${result.Place}`)
        //const athletePr = await getAthletePR(result.AthleteID);
        const averageTime = await getAverageTime(result.AthleteID);
        times.push({
            name: result.FirstName + " " + result.LastName,
            time: result.SortValue,
            school: result.SchoolName,
            //pr: athletePr,
            avgTime: averageTime,
            isSr: result.sr,
            readableTime: result.Result
        });
    }
}

scrape().then(() => {
    const data = JSON.stringify({times: times});
    fs.writeFile('avg_before_hitw.json', data, () => {
        console.groupEnd();
        console.log("Success!");
    });
});