const fs = require('fs');
const got = require('got');
const cheerio = require('cheerio');
const regression = require('regression');
const { createSecureServer } = require('http2');

const meetIdentifiers = {
    hitw2018Id: 143752,
    hitw2018Text: "NIKE - HOLE IN THE WALL XC INVITATIONAL",
    hitw2019Id: 156439,
    hitw2019Text: "NIKE HOLE IN THE WALL XC INVITATIONAL",
    hitw2021Id: 179877,
    hitw2021Text: "NIKE HOLE IN THE WALL XC INVITATIONAL (High School Only)"

}

const secondsToReadable = (secs) => {
    const mins = Math.floor(secs / 60);
    const seconds = Math.round(secs % 60);
    return `${mins}:${seconds >= 10 ? seconds : ("0" + seconds)}`;
}

const readableToSeconds = (read) => {
    const [mins, secs] = read.split(':');
    return (parseFloat(mins) * 60) + (parseFloat(secs));
}

/*const getAthletePR = async(athleteId, season) => {
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
}*/

// ?? Main Refactor as 1 function
// ! Todo use athleteId to get school and with selector S-{season} T-{schoolID} remove unattached seasons
const getAthleteData = async(athleteId, season, meetIdToRemove, cutoffMeetId) => {
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
        //console.log(athleteResults);

        let athleteData = {

        };

        const prMeets = athleteResults.filter((res) => res.isPR);
        const srMeets = athleteResults.filter((res) => res.isSR);
        athleteData.pr = (prMeets.length == 1) ? prMeets[0].time : null;
        athleteData.sr = (srMeets.length == 1) ? srMeets[0].time : null;

        // Average time from all meets
        const totalSeasonTime = athleteResults.reduce((prev, curr) => prev + curr.time, 0);
        athleteData.averageTime = totalSeasonTime / athleteResults.length;

        if(meetIdToRemove) {
            const removedMeet = athleteResults.find((res) => res.meetId == meetIdToRemove);
            if(removedMeet) {
                athleteData.averageTimeMeetRemoved = (totalSeasonTime - removedMeet.time) / (athleteResults.length - 1);
            } else {
                console.log("Unable to remove meetId:", meetIdToRemove);
            }
        }

        if(cutoffMeetId) {
            const cutoffMeetIndex = athleteResults.findIndex((res) => res.meetId == cutoffMeetId);
            if(cutoffMeetIndex != -1) {
                const splicedResults = athleteResults.filter((res, i) => i < cutoffMeetIndex);

                let minTimeBeforeMeet = Math.min(...splicedResults.map((res) => res.time));
                athleteData.minTimeBeforeMeet = minTimeBeforeMeet;

                const totalSpliced = splicedResults.reduce((prev, curr) => prev + curr.time, 0);
                athleteData.averageTimeBeforeMeet = totalSpliced / splicedResults.length;
            } else {
                console.log("Unable to find cuttoff meetId:", cutoffMeetId);
            }
        }

        return athleteData;
    } catch (err) {
        console.log("Error getting athlete data", err);
        return null;
    }
}

// Todo remove multiple meets
// ! Todo use athleteId to get school and with selector S-{season} T-{schoolID} remove unattached seasons
/*const getAverageTime = async(athleteId, season, meetToRemove) => {
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
}*/

// TODO Avg. time for invites
// ? What is the qualification for invites?

// TODO Get athlete Avg. last season

// TODO Regression for each individually, all at once (check/uncheck at will)
const getRaceResults = async() => {
    try {
        const data = await fs.promises.readFile('./saved_data/hw_varsity_2019.json', 'utf-8');
        return JSON.parse(data).results;
    } catch(err) {
        console.log(err);
    }
}

const processData = async(raceResults, raceSeason, writeToFile) => {
    let athleteData = [];
    for(const res of raceResults) {
        const athlete = await getAthleteData(res.AthleteID, raceSeason, meetIdentifiers.hitw2019Id, meetIdentifiers.hitw2019Id);
        if(athlete) {
            if(athlete.sr && athlete.averageTime && athlete.averageTimeBeforeMeet && athlete.averageTimeMeetRemoved) {
                console.log("Pushing data from: ", res.FirstName + " " + res.LastName);
                athleteData.push({
                    name: (res.FirstName + " " + res.LastName),
                    grade: res.Grade,
                    gender: res.Gender,
                    athleteId: res.AthleteID,
                    time: res.SortValue,
                    ...athlete
                });
            }
        }
    }

    if(writeToFile) {
        try {
            const fileWriteString = athleteData.reduce((prev, curr) => (prev + curr.name + "," + curr.time + "," + curr.pr + "," + curr.sr + "," + curr.averageTime + "," + curr.averageTimeMeetRemoved +"," + curr.averageTimeBeforeMeet +  "," + curr.minTimeBeforeMeet + "\n"), 
                "Name,Race Time,PR,SR,Average Time,Avg Time No Race,Avg Time Before Race,Min Time Before Race\n");
            await fs.promises.writeFile('./output_data/hw_varsity_2019_models.csv', fileWriteString, 'utf-8');
        } catch(err) {
            console.log("Error writing output file :(");
            console.log(err);
        }
    }
    return athleteData;
}

const buildRegressionModel = (data) => {
    // time vs Sr
    const model1 = regression.linear(data.map((athlete) => [athlete.sr, athlete.time]));
    // time vs avg time
    const model2 = regression.linear(data.map((athlete) => [athlete.averageTime, athlete.time]));
    // time vs avg time race removed
    const model3 = regression.linear(data.map((athlete) => [athlete.averageTimeMeetRemoved, athlete.time]));
    // time vs avg time before race
    const model4 = regression.linear(data.map((athlete) => [athlete.averageTimeBeforeMeet, athlete.time]));
    // time vs min time before race (what would be current SR if used to predict beforehand)
    const model5 = regression.linear(data.map((athlete) => [athlete.minTimeBeforeMeet, athlete.time]));

    console.log("--------------");
    console.log("Time vs. Sr Model: ", model1);
    console.log("-------------");
    console.log("Time vs Avg. Time", model2);
    console.log("--------------");
    console.log("Time vs. Avg Time without Race", model3);
    console.log("--------------");
    console.log("Time vs. Avg Time before Race", model4);
    console.log("----------------");
    console.log("Time vs. Min Time before Race", model5);

    /*
    Time vs. Sr Model:  {
  points: [
    [ 889.9, 904.08 ],   [ 907, 921.86 ],     [ 915.5, 930.7 ],
    [ 906.3, 921.13 ],   [ 923.5, 939.02 ],   [ 924.4, 939.96 ],
    [ 933.9, 949.84 ],   [ 934, 949.94 ],     [ 918.6, 933.92 ],
    [ 931.8, 947.65 ],   [ 940.3, 956.49 ],   [ 940.9, 957.12 ],
    [ 942.9, 959.2 ],    [ 943.3, 959.61 ],   [ 941.9, 958.16 ],
    [ 935.2, 951.19 ],   [ 942.7, 958.99 ],   [ 944, 960.34 ],
    [ 949.3, 965.85 ],   [ 939.6, 955.76 ],   [ 955.7, 972.51 ],
    [ 950.1, 966.68 ],   [ 949.6, 966.16 ],   [ 948.3, 964.81 ],
    [ 953.9, 970.64 ],   [ 947, 963.46 ],     [ 941.1, 957.32 ],
    [ 958.9, 975.84 ],   [ 962.3, 979.37 ],   [ 958.2, 975.11 ],
    [ 963, 980.1 ],      [ 963.7, 980.83 ],   [ 964, 981.14 ],
    [ 949.1, 965.64 ],   [ 965.5, 982.7 ],    [ 960.6, 977.6 ],
    [ 939.1, 955.24 ],   [ 946.1, 962.52 ],   [ 947.2, 963.67 ],
    [ 927.9, 943.6 ],    [ 965.9, 983.12 ],   [ 971.4, 988.84 ],
    [ 970.8, 988.21 ],   [ 961.7, 978.75 ],   [ 972.6, 990.08 ],
    [ 973.2, 990.71 ],   [ 974.5, 992.06 ],   [ 937.1, 953.16 ],
    [ 972.7, 990.19 ],   [ 952.8, 969.49 ],   [ 979, 996.74 ],
    [ 974.7, 992.27 ],   [ 980.6, 998.4 ],    [ 972.3, 989.77 ],
    [ 981.2, 999.03 ],   [ 971.8, 989.25 ],   [ 969.2, 986.55 ],
    [ 982.5, 1000.38 ],  [ 965.7, 982.91 ],   [ 957.5, 974.38 ],
    [ 971.4, 988.84 ],   [ 986.8, 1004.85 ],  [ 973.3, 990.81 ],
    [ 979.4, 997.16 ],   [ 984.7, 1002.67 ],  [ 983.7, 1001.63 ],
    [ 980.2, 997.99 ],   [ 980.8, 998.61 ],   [ 973.5, 991.02 ],
    [ 967.8, 985.09 ],   [ 990.4, 1008.6 ],   [ 996.9, 1015.36 ],
    [ 978.4, 996.12 ],   [ 968.8, 986.13 ],   [ 995, 1013.38 ],
    [ 999.6, 1018.16 ],  [ 986.1, 1004.12 ],  [ 995.9, 1014.32 ],
    [ 980.8, 998.61 ],   [ 989.5, 1007.66 ],  [ 993, 1011.3 ],
    [ 1002, 1020.66 ],   [ 974, 991.54 ],     [ 1002.4, 1021.08 ],
    [ 1001.4, 1020.04 ], [ 1002.7, 1021.39 ], [ 969, 986.34 ],
    [ 984.2, 1002.15 ],  [ 988.2, 1006.31 ],  [ 997.5, 1015.98 ],
    [ 1002.2, 1020.87 ], [ 974.8, 992.37 ],   [ 977.1, 994.76 ],
    [ 1008.2, 1027.11 ], [ 969.1, 986.44 ],   [ 1006, 1024.82 ],
    [ 997.4, 1015.88 ],  [ 993.2, 1011.51 ],  [ 979.3, 997.05 ],
    [ 984.2, 1002.15 ],
    ... 237 more items
  ],
  predict: [Function: predict],
  equation: [ 1.04, -21.42 ],
  ! r2: 0.89,
  ! string: 'y = 1.04x + -21.42'
}
-------------
Time vs Avg. Time {
  points: [
    [ 908.79, 900.64 ],   [ 913.5, 905.11 ],    [ 963.87, 952.96 ],
    [ 959.39, 948.71 ],   [ 953.82, 943.42 ],   [ 987.42, 975.34 ],
    [ 996.94, 984.38 ],   [ 972.8, 961.45 ],    [ 954.62, 944.18 ],
    [ 967.04, 955.98 ],   [ 983.89, 971.99 ],   [ 966.9, 955.84 ],
    [ 984.2, 972.28 ],    [ 965.23, 954.26 ],   [ 988.93, 976.78 ],
    [ 980.02, 968.31 ],   [ 1013.76, 1000.36 ], [ 974.7, 963.26 ],
    [ 979.26, 967.58 ],   [ 979.03, 967.37 ],   [ 958.2, 947.58 ],
    [ 976.44, 964.91 ],   [ 975.35, 963.87 ],   [ 992.48, 980.15 ],
    [ 966.82, 955.77 ],   [ 976.41, 964.88 ],   [ 1014.82, 1001.37 ],
    [ 1004.43, 991.5 ],   [ 987.19, 975.12 ],   [ 983.82, 971.92 ],
    [ 1001.48, 988.7 ],   [ 1005.48, 992.49 ],  [ 986.94, 974.88 ],
    [ 1007.87, 994.77 ],  [ 992.25, 979.93 ],   [ 982.93, 971.07 ],
    [ 972.39, 961.06 ],   [ 966.44, 955.41 ],   [ 1004.68, 991.74 ],
    [ 973.13, 961.76 ],   [ 983.77, 971.87 ],   [ 1008, 994.89 ],
    [ 985.04, 973.08 ],   [ 977.64, 966.05 ],   [ 1015.21, 1001.74 ],
    [ 1003.33, 990.46 ],  [ 997.45, 984.87 ],   [ 994.76, 982.31 ],
    [ 974.85, 963.4 ],    [ 967.7, 956.61 ],    [ 1006.99, 993.93 ],
    [ 985.93, 973.93 ],   [ 1008.56, 995.42 ],  [ 999.2, 986.53 ],
    [ 1007.31, 994.24 ],  [ 996.27, 983.74 ],   [ 993.9, 981.49 ],
    [ 1022.29, 1008.47 ], [ 995.77, 983.27 ],   [ 990.23, 978.01 ],
    [ 1009.15, 995.99 ],  [ 1043.55, 1028.66 ], [ 989.4, 977.22 ],
    [ 1003.19, 990.32 ],  [ 1011.46, 998.17 ],  [ 1010.3, 997.08 ],
    [ 1010.38, 997.15 ],  [ 1003.99, 991.08 ],  [ 994.63, 982.19 ],
    [ 1004.5, 991.57 ],   [ 1009.09, 995.92 ],  [ 1047.43, 1032.35 ],
    [ 998.56, 985.92 ],   [ 1024.76, 1010.81 ], [ 997.3, 984.72 ],
    [ 1022.48, 1008.65 ], [ 1010.72, 997.48 ],  [ 1026.76, 1012.71 ],
    [ 993.66, 981.26 ],   [ 1011.49, 998.2 ],   [ 1005.27, 992.29 ],
    [ 1061.5, 1045.71 ],  [ 994.73, 982.29 ],   [ 1028.29, 1014.16 ],
    [ 1021.74, 1007.95 ], [ 1049.02, 1033.86 ], [ 1017.9, 1004.3 ],
    [ 1020.28, 1006.56 ], [ 1014.09, 1000.67 ], [ 1026.76, 1012.71 ],
    [ 1044.96, 1030 ],    [ 1013.79, 1000.39 ], [ 1015.77, 1002.27 ],
    [ 1025.24, 1011.27 ], [ 1002.25, 989.43 ],  [ 1034.1, 1019.68 ],
    [ 1048.88, 1033.72 ], [ 1023.82, 1009.92 ], [ 1042.99, 1028.13 ],
    [ 1058.53, 1042.89 ],
    ... 237 more items
  ],
  predict: [Function: predict],
  equation: [ 0.95, 37.29 ],
  ! r2: 0.86,
  ! string: 'y = 0.95x + 37.29'
}
--------------
Time vs. Avg Time without Race {
  points: [
    [ 911.93, 910.03 ],   [ 913.85, 911.74 ],   [ 969.91, 961.63 ],
    [ 964.84, 957.12 ],   [ 956.73, 949.9 ],    [ 993.38, 982.52 ],
    [ 1003.94, 991.92 ],  [ 980.56, 971.11 ],   [ 956.64, 949.82 ],
    [ 970.53, 962.18 ],   [ 988.25, 977.95 ],   [ 971.23, 962.81 ],
    [ 991.08, 980.47 ],   [ 967.98, 959.91 ],   [ 994.47, 983.49 ],
    [ 983.68, 973.88 ],   [ 1021.11, 1007.2 ],  [ 980.02, 970.63 ],
    [ 983, 973.28 ],      [ 982.14, 972.52 ],   [ 960.7, 953.43 ],
    [ 978.89, 969.62 ],   [ 977.96, 968.79 ],   [ 995.66, 984.55 ],
    [ 968.58, 960.45 ],   [ 978.96, 969.68 ],   [ 1019.06, 1005.37 ],
    [ 1009.36, 996.74 ],  [ 989.96, 979.47 ],   [ 986.49, 976.38 ],
    [ 1004.98, 992.84 ],  [ 1010.7, 997.93 ],   [ 989.49, 979.06 ],
    [ 1012.23, 999.29 ],  [ 996.07, 984.91 ],   [ 985.17, 975.21 ],
    [ 972.98, 964.36 ],   [ 966.16, 958.29 ],   [ 1008.59, 996.05 ],
    [ 974.07, 965.33 ],   [ 985.88, 975.85 ],   [ 1015.32, 1002.04 ],
    [ 988.33, 978.02 ],   [ 978.5, 969.28 ],    [ 1020.54, 1006.69 ],
    [ 1007.06, 994.7 ],   [ 1002.04, 990.23 ],  [ 996.76, 985.52 ],
    [ 972.7, 964.11 ],    [ 965.28, 957.5 ],    [ 1010.1, 997.4 ],
    [ 987.32, 977.12 ],   [ 1012.56, 999.59 ],  [ 1001.51, 989.76 ],
    [ 1010.58, 997.82 ],  [ 998.08, 986.7 ],    [ 995.56, 984.46 ],
    [ 1026.71, 1012.18 ], [ 997.5, 986.19 ],    [ 990.93, 980.34 ],
    [ 1011.41, 998.56 ],  [ 1049.22, 1032.22 ], [ 989.44, 979.01 ],
    [ 1004.69, 992.58 ],  [ 1014.16, 1001.01 ], [ 1012.53, 999.56 ],
    [ 1012.87, 999.87 ],  [ 1005.3, 993.13 ],   [ 994.72, 983.71 ],
    [ 1005.6, 993.39 ],   [ 1011.22, 998.39 ],  [ 1053.04, 1035.62 ],
    [ 998.77, 987.31 ],   [ 1027.18, 1012.6 ],  [ 995, 983.96 ],
    [ 1024.77, 1010.46 ], [ 1011.93, 999.02 ],  [ 1030.4, 1015.47 ],
    [ 992.33, 981.59 ],   [ 1012.89, 999.88 ],  [ 1007.05, 994.68 ],
    [ 1121, 1096.1 ],     [ 993.81, 982.9 ],    [ 1031.99, 1016.88 ],
    [ 1024.88, 1010.56 ], [ 1054.78, 1037.16 ], [ 1019.69, 1005.93 ],
    [ 1023.22, 1009.08 ], [ 1015.43, 1002.15 ], [ 1029.31, 1014.5 ],
    [ 1051.32, 1034.08 ], [ 1014.51, 1001.32 ], [ 1017.12, 1003.64 ],
    [ 1027.67, 1013.04 ], [ 1001.34, 989.61 ],  [ 1039.14, 1023.24 ],
    [ 1054.51, 1036.93 ], [ 1025.58, 1011.17 ], [ 1047.11, 1030.34 ],
    [ 1063.33, 1044.77 ],
    ... 237 more items
  ],
  predict: [Function: predict],
  equation: [ 0.89, 98.41 ],
  ! r2: 0.8,
  ! string: 'y = 0.89x + 98.41'
}
--------------
Time vs. Avg Time before Race {
  points: [
    [ 897.33, 909.83 ],   [ 913.85, 922.54 ],   [ 969, 965.01 ],
    [ 997.43, 986.9 ],    [ 963.33, 960.65 ],   [ 1024.38, 1007.65 ],
    [ 1038.26, 1018.34 ], [ 988.3, 979.87 ],    [ 961.94, 959.57 ],
    [ 993.6, 983.95 ],    [ 992.68, 983.24 ],   [ 974.7, 969.4 ],
    [ 1023.55, 1007.01 ], [ 970.5, 966.17 ],    [ 997.93, 987.29 ],
    [ 976.36, 970.68 ],   [ 1040.8, 1020.3 ],   [ 992.35, 982.99 ],
    [ 986.9, 978.79 ],    [ 989.83, 981.05 ],   [ 960.7, 958.62 ],
    [ 988.18, 979.78 ],   [ 984.75, 977.14 ],   [ 1010.77, 997.17 ],
    [ 977.5, 971.56 ],    [ 994.37, 984.54 ],   [ 1038.82, 1018.77 ],
    [ 1027.85, 1010.32 ], [ 998.52, 987.74 ],   [ 990.83, 981.82 ],
    [ 1008.69, 995.57 ],  [ 1023.02, 1006.61 ], [ 994.98, 985.01 ],
    [ 1039.56, 1019.34 ], [ 998.4, 987.65 ],    [ 1000.5, 989.27 ],
    [ 987.18, 979 ],      [ 961.2, 959 ],       [ 987.48, 979.24 ],
    [ 1017, 1001.97 ],    [ 978, 971.94 ],      [ 1066.6, 1040.16 ],
    [ 993.1, 983.57 ],    [ 991.45, 982.3 ],    [ 1037.84, 1018.02 ],
    [ 1003.72, 991.74 ],  [ 1002.04, 990.45 ],  [ 1017.78, 1002.57 ],
    [ 972.7, 967.86 ],    [ 952.8, 952.54 ],    [ 1008.66, 995.55 ],
    [ 1002.45, 990.77 ],  [ 1023.85, 1007.24 ], [ 1015.18, 1000.56 ],
    [ 1012.25, 998.31 ],  [ 1006.75, 994.08 ],  [ 1002.63, 990.91 ],
    [ 1047.52, 1025.47 ], [ 1022.05, 1005.86 ], [ 991.6, 982.41 ],
    [ 1034.12, 1015.15 ], [ 1085.12, 1054.42 ], [ 1002.25, 990.61 ],
    [ 1014.44, 1000 ],    [ 1017.67, 1002.48 ], [ 1019.08, 1003.57 ],
    [ 1001.3, 989.88 ],   [ 1009.77, 996.4 ],   [ 1025.5, 1008.52 ],
    [ 1033.93, 1015 ],    [ 1000.03, 988.91 ],  [ 1064.36, 1038.44 ],
    [ 1015.3, 1000.66 ],  [ 1049.79, 1027.21 ], [ 995, 985.03 ],
    [ 1015.85, 1001.08 ], [ 1028.38, 1010.73 ], [ 1030.4, 1012.29 ],
    [ 1001.15, 989.77 ],  [ 1021.4, 1005.36 ],  [ 1021.1, 1005.13 ],
    [ 1121, 1082.05 ],    [ 998.45, 987.69 ],   [ 1031.05, 1012.79 ],
    [ 1039, 1018.91 ],    [ 1091.68, 1059.47 ], [ 1020.27, 1004.49 ],
    [ 1058.9, 1034.23 ],  [ 1041.5, 1020.84 ],  [ 1044.08, 1022.82 ],
    [ 1010.5, 996.97 ],   [ 1020.22, 1004.45 ], [ 1043.95, 1022.72 ],
    [ 1031.25, 1012.94 ], [ 1009.25, 996 ],     [ 1039.14, 1019.02 ],
    [ 1073.68, 1045.61 ], [ 1044.5, 1023.15 ],  [ 1066.54, 1040.12 ],
    [ 1092.88, 1060.4 ],
    ... 237 more items
  ],
  predict: [Function: predict],
  equation: [ 0.77, 218.88 ],
  ! r2: 0.67,
  ! string: 'y = 0.77x + 218.88'
}
----------------
Time vs. Min Time before Race {
  points: [
    [ 890.1, 900.62 ],   [ 907, 916.51 ],     [ 953.5, 960.22 ],
    [ 906.3, 915.85 ],   [ 930.8, 938.88 ],   [ 954.7, 961.35 ],
    [ 941.9, 949.32 ],   [ 988.3, 992.93 ],   [ 933.7, 941.61 ],
    [ 938.9, 946.5 ],    [ 984, 988.89 ],     [ 953.2, 959.94 ],
    [ 995.1, 999.32 ],   [ 943.7, 951.01 ],   [ 979.3, 984.47 ],
    [ 935.2, 943.02 ],   [ 968.7, 974.51 ],   [ 944, 951.29 ],
    [ 961.6, 967.83 ],   [ 972.7, 978.27 ],   [ 960.7, 966.99 ],
    [ 969.8, 975.54 ],   [ 961.6, 967.83 ],   [ 963, 969.15 ],
    [ 965.1, 971.12 ],   [ 983.3, 988.23 ],   [ 966.2, 972.16 ],
    [ 987.6, 992.27 ],   [ 976.3, 981.65 ],   [ 966.9, 972.82 ],
    [ 966.3, 972.25 ],   [ 975.8, 981.18 ],   [ 966.5, 972.44 ],
    [ 971.2, 976.86 ],   [ 984.3, 989.17 ],   [ 972.2, 977.8 ],
    [ 963.2, 969.34 ],   [ 946.1, 953.26 ],   [ 962.9, 969.06 ],
    [ 1017, 1019.91 ],   [ 965.9, 971.88 ],   [ 972.5, 978.08 ],
    [ 984, 988.89 ],     [ 984.3, 989.17 ],   [ 994.7, 998.95 ],
    [ 973.2, 978.74 ],   [ 981.9, 986.92 ],   [ 960.1, 966.42 ],
    [ 972.7, 978.27 ],   [ 952.8, 959.56 ],   [ 980.1, 985.22 ],
    [ 978.3, 983.53 ],   [ 996.5, 1000.64 ],  [ 994, 998.29 ],
    [ 994.5, 998.76 ],   [ 987.2, 991.9 ],    [ 995.7, 999.89 ],
    [ 991.9, 996.32 ],   [ 999.3, 1003.27 ],  [ 977.7, 982.97 ],
    [ 999.8, 1003.74 ],  [ 1000.6, 1004.49 ], [ 998.7, 1002.71 ],
    [ 984.7, 989.55 ],   [ 1004.2, 1007.88 ], [ 992.9, 997.26 ],
    [ 980.2, 985.32 ],   [ 1000.8, 1004.68 ], [ 1017.1, 1020 ],
    [ 996.9, 1001.02 ],  [ 990.4, 994.91 ],   [ 1019, 1021.79 ],
    [ 990.8, 995.28 ],   [ 993.8, 998.1 ],    [ 995, 999.23 ],
    [ 1005.1, 1008.72 ], [ 996.8, 1000.92 ],  [ 995.9, 1000.08 ],
    [ 999.7, 1003.65 ],  [ 1003.2, 1006.94 ], [ 1021.1, 1023.76 ],
    [ 1121, 1117.67 ],   [ 974, 979.49 ],     [ 1013, 1016.15 ],
    [ 1024, 1026.49 ],   [ 1045, 1046.23 ],   [ 1001, 1004.87 ],
    [ 1007.8, 1011.26 ], [ 1031, 1033.07 ],   [ 998.7, 1002.71 ],
    [ 1002.2, 1006 ],    [ 989.9, 994.44 ],   [ 1011.3, 1014.55 ],
    [ 1017.2, 1020.1 ],  [ 979.8, 984.94 ],   [ 1006, 1009.57 ],
    [ 1035.6, 1037.39 ], [ 998.4, 1002.43 ],  [ 1037.2, 1038.9 ],
    [ 1043.7, 1045.01 ],
    ... 237 more items
  ],
  predict: [Function: predict],
  equation: [ 0.94, 63.93 ],
  ! r2: 0.8,
  ! string: 'y = 0.94x + 63.93'
}
    */

}

//getAthleteData(13955486, 2019, meetIdentifiers.hitw2019Id, meetIdentifiers.hitw2019Id).then(t => console.log(t));
getRaceResults().then((res) => processData(res, 2019, true).then(d => buildRegressionModel(d)));
//getAverageTime(13955486, 2021, "").then((t) => console.log(secondsToReadable(t)));
//getRaceResults().then((results) => processData(results, true).then(d => buildRegressionModel(d)));
//getAthletePR(13955486, 2021).then((pr) => console.log(secondsToReadable(pr)));
//getAverageTime(9711766, 2019, hitw).then((t) => console.log(secondsToReadable(t)));