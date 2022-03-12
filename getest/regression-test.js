const fs = require('fs');
const got = require('got');
const cheerio = require('cheerio');
const regression = require('regression');

// ! Download data + Fake user agent and other headers as best you can
// ! Request now needs anettoken
// ? Time vs PR wasn't good
// ? Time vs Avg Season Time was good for complete seasons
// TODO Try Time vs Avg Time Up to that point -> Still is okay but correlation not as good (better the more races)
// TODO Try time vs avg for invites? Time vs avg full last season? Time vs time at similar race
// Option to do vs time or avg thus far, based on whatever user feels best represents performance
// Also display correlation value to put into specific (helpful tooltips :))
// Still give statistics on avg time drop etc. and percentage of SRs in race

const nameToID = {
    "josh": 13955486,
    "jonathan": 15820341,
    "jerry": 13955504,
    "caleb": 13955541,
    "hunter": 13955573
};

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
        //const removedMeet = 'NIKE HOLE IN THE WALL XC INVITATIONAL';
        const removedMeet = 'Bellevue Cross Country Invite';
        const meetIndex = seasonText.indexOf(removedMeet);
        const p1 = seasonText.substr(0, meetIndex - 17);
        const p2 = seasonText.substr(meetIndex);
        let times = (p1 + p2).match(/[0-9]+:[0-9]+/g);
        //let times = seasonText.match(/[0-9]+:[0-9]+/g);
        console.log(times);

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
        const data = await fs.promises.readFile('./saved_data/bi_jv.json', 'utf-8');
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
        if(averageTime) {
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
}

scrape().then(async() => {
    const data = times.map((athlete) => {
        return [parseFloat(athlete.avgTime), parseFloat(athlete.time)];
    })

    console.log(data);
    const result = regression.linear(data);
    console.log(result);
});