const mongoose = require('mongoose');
require('dotenv').config();

const main = async() => {
    await mongoose.connect(`mongodb+srv://joshdelg:${process.env.mongoPass}@xccluster.x59alfz.mongodb.net/test`);

    const athleteSchema = new mongoose.Schema({
        athleteId: String,
        name: String,
        results: [
            {
                season: String,
                grade: Number,
                meets: [
                    {
                        place: Number,
                        time: Number,
                        timeReadable: Number,
                        date: Date,
                        meetName: String,
                        meetId: Number,
                        raceId: Number,
                        distance: String,
                        isSr: Boolean,
                        isPr: Boolean
                    }
                ]
            }
        ]
    });

    const Athlete = mongoose.model('Athlete', athleteSchema);
    // const josh = new Athlete({
    //     athleteId: 123,
    //     name: "Joshua Delgadillo",
    //     results: [
    //         {
    //             season: "2019",
    //             grade: 10,
    //             meets: [
    //                 {
    //                     place: 18,
    //                     time: 1129,
    //                     timeReadble: "18:49",
    //                     date: "Sep 17 2019",
    //                     meetName: "Newport @ Issaquah",
    //                     meetId: 1234,
    //                     raceId: 4321,
    //                     distance: "5000 Meters",
    //                     isSr: false,
    //                     isPr: false
    //                 }
    //             ]
    //         }
    //     ]
    // });
    // console.log(josh.name);

    // await josh.save((err) => console.log("Save error", err));
    const athletes = await Athlete.find();
    console.log(athletes);
};

main().then(() => console.log("Success!")).catch((err) => console.log(err));