const mongoose = require('mongoose');
const got = require('got');
const cheerio = require('cheerio');
require('dotenv').config();

const readableToSeconds = (read) => {
    const [mins, secs] = read.split(':');
    return (parseFloat(mins) * 60) + (parseFloat(secs));
}

const getAthleteData = async(athleteId) => {
    try {
        console.log("Fetching data for athlete [", athleteId, "]...");
        const response = await got(`https://www.athletic.net/CrossCountry/Athlete.aspx?AID=${athleteId}`);
        const $ = cheerio.load(response.body);
        
        const name = $('main h2 span.mr-2').text().trim();

        const seasons = $(`div[id*="S-"]`);
        let athleteData = [];
        $(seasons).each((si, sel) => {
            const seasonHeader = $(sel).children().first();
            const season = $(seasonHeader).text().match(/[0-9]{4}/)[0];
            const grade = $('span', seasonHeader).text();
            const raceTable = $(sel).children().last();
            let athleteResults = [];
            $('table', raceTable).each((ti, tel) => {
                const distance = $(tel).prev().text();
                $('tr', tel).each((i, el) => {
                    const placeElement = $(el).children()[0];
                    const resultElement = $(el).children()[1];
                    const dateElement = $(el).children()[2];
                    const meetElement = $(el).children()[3];
                    const meetLink = $('a', meetElement).attr().href;
        
                    athleteResults.push({
                        place: parseInt($(placeElement).text()) || 0,
                        timeReadable: $(resultElement).text().replace(/[a-zA-Z]{2}/g, "") || "",
                        time: readableToSeconds($(resultElement).text().replace(/[a-zA-Z]{2}/g, "")) || 0,
                        distance: distance.replace(",", ""),
                        date: `${$(dateElement).text()}, ${season}`,
                        meetName: $(meetElement).text(),
                        meetId: meetLink.match(/\d+/g)[0],
                        raceId: meetLink.match(/\d+/g)[1],
                        isSR: $(resultElement).text().includes("SR") || $(resultElement).text().includes("PR"),
                        isPR: $(resultElement).text().includes("PR")
                    });
                })
            });
            if(si != 0 && (season == athleteData[athleteData.length - 1].season)) {
                athleteData[athleteData.length - 1].meets.push(...athleteResults);
            } else {
                athleteData.push({
                    season: season,
                    grade: grade,
                    meets: athleteResults
                });
            }
            
        });

        return {
            athleteId: athleteId,
            name: name,
            results: athleteData
        }
    } catch (err) {
        console.log("Error fetching athlete data:", err);
        return null;
    }
};

// getAthleteData(13955486).then((res) => console.log(res.results[0].meets));

const main = async() => {
    await mongoose.connect(`mongodb+srv://joshdelg:${process.env.mongoPass}@xccluster.x59alfz.mongodb.net/test`);

    const athleteSchema = new mongoose.Schema({
        athleteId: String,
        name: String,
        results: [
            {
                season: String,
                grade: String,
                meets: [
                    {
                        place: Number,
                        time: Number,
                        timeReadable: String,
                        date: Date,
                        meetName: String,
                        meetId: String,
                        raceId: String,
                        distance: String,
                        isSr: Boolean,
                        isPr: Boolean
                    }
                ]
            }
        ]
    });

    const Athlete = mongoose.model('Athlete', athleteSchema);

    // Loop through all athlete to add to schema
    // TODO Scrape top 9 from 2021 ranking and add to database
    // TODO then from downloaded results lists specified in Notion
    const athletesToAdd = [
        13955504, 17663397, 15820341, 18871653, 16555096, 13955486
    ]

    for(const aid of athletesToAdd) {
        const found = await Athlete.find({ athleteId: aid});
        if(found.length > 0) {
            console.log("Athlete [", aid, "] already in database");
        } else {
            const athleteData = await getAthleteData(aid);
            if(athleteData) {
                const athlete = new Athlete({...athleteData});
                athlete.save((err) => {
                    if(err) console.log("Error saving athlete [", aid, "]", err);
                })
            }
        }
    }
};

main().then(() => console.log("Success!")).catch((err) => console.log(err));