import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";

dayjs.locale("br");
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.DATABASE_URL);

try {
  await mongoClient.connect();
} catch (err) {
  console.log(err);
  process.exit(1);
}

const db = mongoClient.db();
const participantsCollection = db.collection("participants");
const messagesCollection = db.collection("messages");

app.post("/participants", async (req, res) => {
  const promptSchema = joi.object({
    name: joi.string().required(),
  });
  const { error } = promptSchema.validate(req.body);
  if (error) {
    res.sendStatus(422);
    return;
  }

  const username = req.body.name;

  try {
    const participantExist = await participantsCollection.findOne({
      name: username,
    });

    if (participantExist) {
      res.sendStatus(409);
      return;
    }

    await participantsCollection.insertOne({
      name: username,
      lastStatus: Date.now(),
    });

    await messagesCollection.insertOne({
      from: username,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await participantsCollection.find().toArray();
    res.send(participants);
  } catch (err) {
    console.log(err);
    res.status(500).send("Não foi possível retornar a lista de participantes.");
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;

  try {
    const participantExist = await participantsCollection.findOne({
      name: user,
    });

    if (!participantExist) {
      return res.status(422).send("Participante não cadastrado!");
    }

    const messageSchema = joi.object({
      to: joi.string().required(),
      text: joi.string().required(),
      type: joi.string(),
    });

    const { error } = messageSchema.validate(req.body);

    if (error) {
      return res.status(422).send("Erro na composição da mensagem!");
    }

    await messagesCollection.insertOne({
      to: to,
      text: text,
      type: type,
      from: user,
      time: dayjs().format("HH:mm:ss"),
    });

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  const { user } = req.headers;
  const limit = parseInt(req.query.limit);

  try {
    const messages = await messagesCollection
      .find({
        $or: [
          { type: "message" },
          { type: "status" },
          {
            type: "private_message",
            $or: [{ to: user }, { from: user }],
          },
        ],
      })
      .limit(limit)
      .toArray();

    res.send(messages);
  } catch (err) {
    console.log(err);
    res.status(500).send("Não foi possível retornar a lista de mensagens.");
  }
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;

  try {
    const participantExist = await participantsCollection.findOne({
      name: user,
    });

    if (!participantExist) {
      return res.status(404).send("Participante não cadastrado!");
    }

    await participantsCollection.updateOne(
      { _id: ObjectId(participantExist._id) },
      { $set: { lastStatus: Date.now() } }
    );

    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

setInterval(deleteInactives, 15000);

async function deleteInactives() {
  try {
    const allUsers = await participantsCollection.find().toArray();

    allUsers.forEach(async (user) => {
      if (!user.name) {
        return;
      }

      if (user.lastStatus <= Date.now() - 10000) {
        await participantsCollection.deleteOne({
          _id: ObjectId(user._id),
        });

        await messagesCollection.insertOne({
          from: user.name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: dayjs().format("HH:mm:ss"),
        });
      }
    });
  } catch (err) {
    console.log(err);
  }
}

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`O servidor está sendo executado na porta ${port}`);
});