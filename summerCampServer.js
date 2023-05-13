const http = require("http");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({ path: path.resolve(__dirname, 'credentials/.env') })

const app = express();
app.set("views", path.resolve(__dirname, "templates"));
app.use(bodyParser.urlencoded({extended:false}));
app.set("view engine", "ejs");

process.stdin.setEncoding("utf8");

const userName = process.env.MONGO_DB_USERNAME;
const password = process.env.MONGO_DB_PASSWORD;
const databaseName = process.env.MONGO_DB_NAME;
const collection = process.env.MONGO_COLLECTION;

const databaseAndCollection = {db: databaseName, collection: collection};

const { MongoClient, ServerApiVersion } = require('mongodb');

async function insertApplicant(client, databaseAndCollection, applicant) {
    const result = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).insertOne(applicant);
}

async function lookUpEmail(client, databaseAndCollection, email) {
    let filter = {email: email};
    const result = await client.db(databaseAndCollection.db)
                        .collection(databaseAndCollection.collection)
                        .findOne(filter);
   if (result) {
       return result;
   } else {
       return null;
   }
}

async function lookUpGPA(client, databaseAndCollection, gpa) {
    let filter = {GPA : { $gte: gpa}};
    const cursor = client.db(databaseAndCollection.db)
    .collection(databaseAndCollection.collection)
    .find(filter);

    return await cursor.toArray();
}

if (process.argv[2] && !(process.argv[3])) {
    const uri = `mongodb+srv://${userName}:${password}@cluster0.jms7ap3.mongodb.net/?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

    const portNumber = process.argv[2];

    app.listen(portNumber);

    app.get("/", (request, response) => {
        response.render("index");
    });

    app.get("/apply", (request, response) => {
        let form = `<form action="http://localhost:${portNumber}/processApplication" method="post" onsubmit = "return confirmSubmit()">`;
        response.render("apply", {form: form});
    });

    app.post("/processApplication", async (request, response) => {
        let {name, email, GPA, backgroundInformation} = request.body;
        try {
            await client.connect();
            let applicant = {name: name, email: email, GPA: GPA, backgroundInformation: backgroundInformation};
            await insertApplicant(client, databaseAndCollection, applicant);
        } catch (e) {
            console.error(e);
        } finally {
            await client.close();
        }
        response.render("processApplication", {name: name, email: email, GPA: GPA, backgroundInformation: backgroundInformation});
    });

    app.get("/review", (request, response) => {
        let form = `<form action="http://localhost:${portNumber}/processReviewApplication" method="post">`;
        response.render("reviewApplication", {form: form});
    });

    app.post("/processReviewApplication", async (request, response) => {
        let {email} = request.body;
        try {
            await client.connect();
            let applicant = await lookUpEmail(client, databaseAndCollection, email);
            if (applicant === null) {
                response.render("processReviewApplication", {name: "NONE", email: "NONE", GPA: "NONE", backgroundInformation: "NONE"});
            } else {
                let name = applicant.name;
                let GPA = applicant.GPA;
                let backgroundInformation = applicant.backgroundInformation;
                response.render("processReviewApplication", {name: name, email: email, GPA: GPA, backgroundInformation: backgroundInformation});
            }
        } catch (e) {
            console.error(e);
        } finally {
            await client.close();
        }
    });

    app.get("/gpa", (request, response) => {
        let form = `<form action="http://localhost:${portNumber}/processAdminGPA" method="post">`;
        response.render("adminGPA", {form: form});
    });

    app.post("/processAdminGPA", async (request, response) => {
        let {GPA} = request.body;
        try {
            await client.connect();
            let applicants = await lookUpGPA(client, databaseAndCollection, GPA);
            let table = "<table border = '1'><tr><th>Name</th><th>GPA</th></tr>";
            applicants.forEach((applicant) => table += "<tr><td>" + applicant.name + "</td><td>" + applicant.GPA + "</td></tr>");
            table += "</table>";
            response.render("processAdminGPA", {table: table});
        } catch (e) {
            console.error(e);
        } finally {
            await client.close();
        }
    });

    app.get("/remove", (request, response) => {
        let form = `<form action="http://localhost:${portNumber}/processRemove" method="post" onsubmit = "confirmSubmit()">`;
        response.render("remove", {form: form});
    });

    app.post("/processRemove", async (request, response) => {
        try {
            await client.connect();
            const result = await client.db(databaseAndCollection.db)
            .collection(databaseAndCollection.collection)
            .deleteMany({});
            response.render("processRemove", {content: `All applications have been removed from the database. Number of applications removed: ${result.deletedCount}`});
        } catch (e) {
            console.error(e);
        } finally {
            await client.close();
        }
    });

    console.log(`Web server is running at http://localhost:${portNumber}`);

    const prompt = "Stop to shutdown the server: ";

    process.stdout.write(prompt);

    process.stdin.on('readable', () => {
        let dataInput;
        while ((dataInput = process.stdin.read()) !== null) {
            let command = dataInput.trim();
            if (command === "stop") {
                console.log("Shutting down the server");
                process.exit(0);
            } else {
                console.log(`Invalid command: ${command}`);
            }
            process.stdout.write(prompt);
            process.stdin.resume();
        }
    });
}