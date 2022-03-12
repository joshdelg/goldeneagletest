const got = require('got');
const cheerio = require('cheerio');

//const athleteUrl = 'https://www.athletic.net/CrossCountry/Athlete.aspx?AID=13955486'; // Josh
//const athleteUrl = 'https://www.athletic.net/CrossCountry/Athlete.aspx?AID=15820341'; // Jonathan
//const athleteUrl = 'https://www.athletic.net/CrossCountry/Athlete.aspx?AID=13955504'; // Jerry
//const athleteUrl = 'https://www.athletic.net/CrossCountry/Athlete.aspx?AID=13955541'; // Caleb
const athleteUrl = 'https://www.athletic.net/CrossCountry/Athlete.aspx?AID=13955573'; // Hunter
const removedMeet = 'NIKE HOLE IN THE WALL XC INVITATIONAL';
//const removedMeet = 'Bellevue Cross Country Invite';

// ! Works well with HITW time in average
// TODO Test by excludes HITW time from average -> new trend line

got(athleteUrl).then(response => {
    const $ = cheerio.load(response.body);
    const allTimes = $('div[id*="S-2019"]').children().last();

    let season5kTable;
    allTimes.children().each((i, el) => {
        if(el.name === 'h5' && $(el).text() === '5,000 Meters') {
            season5kTable = $(el).next();
        }
    })

    const seasonText = season5kTable.text();
    // To remove predicting meet
    /*const meetIndex = seasonText.indexOf(removedMeet);
    const p1 = seasonText.substr(0, meetIndex - 17);
    const p2 = seasonText.substr(meetIndex);
    console.log(p1 + p2);
    let times = (p1 + p2).match(/[0-9]+:[0-9]+/g);*/
    //let times = seasonText.match(/[0-9]+:[0-9]+/g);

    // Get average of time before meet
    const meetIndex = seasonText.indexOf(removedMeet);
    const timesBefore = seasonText.substring(0, meetIndex - 17);
    let times = timesBefore.match(/[0-9]+:[0-9]+/g);
    console.log(times);

    let timesSeconds = times.map(t => parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1]));
    let averageTimeSeconds = timesSeconds.reduce((agg, val) => agg + val) / timesSeconds.length;
    let avgTimeReadable = `${Math.floor(averageTimeSeconds / 60)}:${Math.round(averageTimeSeconds % 60)}`;
    console.log(avgTimeReadable);
}).catch(err => console.log(err));