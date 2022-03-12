const fs = require('fs');

const load = async() => {
    const data = await fs.promises.readFile('./saved_data/hw_varsity.json', 'utf-8');
    return JSON.parse(data).results;
}

load().then((data) => console.log(data));