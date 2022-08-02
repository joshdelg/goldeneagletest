const mongoose = require('mongoose');
const got = require('got');
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config();

const readableToSeconds = (read) => {
    const [mins, secs] = read.split(':');
    return (parseFloat(mins) * 60) + (parseFloat(secs));
}

const getTeamRunners = async(schoolId, numberToScrape) => {
    try {
        const response = await got('https://www.athletic.net/CrossCountry/seasonbest', {
            searchParams: {
                SchoolID: schoolId,
                S: 2021
            }
        });
        const $ = cheerio.load(response.body);
        
        let teamAthletes = {
            men: [],
            women: []
        };
        
        $('div.distance').each((i, el) => {
            const header = $('h3', el).text();
            if(header.startsWith('5,000 Meters')) {
                const menList = $('div#M_', el);
                const womenList = $('div#F_', el);
                
                $('tr', menList).each((ii, runner) => {
                    if(ii < numberToScrape) {
                        const athleteId = $(runner).children().eq(2).children().first().attr().href.match(/[0-9]+/)[0];
                        teamAthletes.men.push(athleteId);
                    }
                });
                
                $('tr', womenList).each((ii, runner) => {
                    if(ii < numberToScrape) {
                        const athleteId = $(runner).children().eq(2).children().first().attr().href.match(/[0-9]+/)[0];
                        teamAthletes.women.push(athleteId);
                    }
                });
            }
        });
        
        return teamAthletes;
    } catch (err) {
        console.log("Error getting ranked athletes on team [", schoolId, "]", err);
        return null;
    }
}

const athletesFromResults = async(fileUrl) => {
    const data = await fs.promises.readFile(fileUrl, 'utf-8');
    const results = JSON.parse(data).results;
    const athletes = results.map((a) => a.AthleteID);
    return athletes;
}

const getAthleteData = async(athleteId) => {
    try {
        console.log("Fetching data for athlete [", athleteId, "]...");
        const response = await got(`https://www.athletic.net/CrossCountry/Athlete.aspx?AID=${athleteId}`);
        const $ = cheerio.load(response.body);
        
        const name = $('main h2 span.mr-2').text().trim();
        const gender = $('img.mr-1').attr().src.charAt(23).toUpperCase();
        const seasons = $(`div[id*="S-"]`);
        let schoolId = "";
        let pr5k = 0;
        let athleteData = [];
        $(seasons).each((si, sel) => {
            const seasonHeader = $(sel).children().first();
            schoolId = (si == 0) ? $('a', seasonHeader).attr().href.match(/[0-9]+/)[0] : schoolId;
            const season = $(seasonHeader).text().match(/[0-9]{4}/)[0];
            const grade = $('span', seasonHeader).text();
            const raceTable = $(sel).children().last();
            let athleteResults = [];
            $('table', raceTable).each((ti, tel) => {
                const distance = $(tel).prev().text();
                if(distance === "5,000 Meters") {
                    const temppr = $('small.pr-text', tel).parent().prev().text();
                    if(temppr !== "") pr5k = readableToSeconds(temppr);
                }
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
            gender: gender,
            pr5k: pr5k,
            schoolId: schoolId,
            results: athleteData
        }
    } catch (err) {
        console.log("Error fetching athlete data:", err);
        return null;
    }
};

// athletesFromResults('./saved_data/hw_men_froshsoph1_2019.json').then();
// getAthleteData(13955486).then((res) => console.log(res));

const main = async() => {
    await mongoose.connect(`mongodb+srv://joshdelg:${process.env.mongoPass}@xccluster.x59alfz.mongodb.net/test`);

    const athleteSchema = new mongoose.Schema({
        athleteId: String,
        name: String,
        gender: String,
        pr5k: Number,
        schoolId: String,
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

    // TODO then from downloaded results lists specified in Notion

    const rankedAthletes = await getTeamRunners(408, 16);

    let athletesToAdd = [...rankedAthletes.men, ...rankedAthletes.women];

    const fileUrls = [
        './saved_data/hw_men_froshsoph1_2019.json',
        './saved_data/hw_men_froshsoph2_2019.json',
        './saved_data/hw_men_jvover21_2019.json',
        './saved_data/hw_men_jvsub21_2019.json',
        './saved_data/hw_men_varsityover18_2019.json',
        './saved_data/hw_men_varsitysub18_2019.json',
        './saved_data/hw_women_jv2426_2019.json',
        './saved_data/hw_women_jvover26_2019.json',
        './saved_data/hw_women_jvsub24_2019.json',
        './saved_data/hw_women_varsityover2230_2019.json',
        './saved_data/hw_women_varsitysub2230_2019.json',
    ]

    for(const url of fileUrls) {
        const aid = await athletesFromResults(url);
        athletesToAdd.push(...aid);
    }

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

// getTeamRunners(408, 9).then();

main().then(() => console.log("Success!")).catch((err) => console.log(err));