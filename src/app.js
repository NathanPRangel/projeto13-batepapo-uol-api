import express, { json } from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";


dayjs.locale("br");
dotenv.config();

const app = express();
app.use(cors());
app.use(json());

const mongoClient = new MongoClient(process.env.MONGO_URI);

try {
  await mongoClient.connect();
} catch (err) {
  console.log(err);
}

const db = mongoClient.db("uolDatabase");
const coleçãodparticipants = db.collection("participants");
const ColeçãodMensagens = db.collection("messages");

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
    const participantExist = await coleçãodparticipants.findOne({
      name: username,
    });

    if (participantExist) {
      res.sendStatus(409);
      return;
    }
    await coleçãodparticipants.insertOne({
      name: username,
      lastStatus: Date.now(),
    });
    await ColeçãodMensagens.insertOne({
      from: username,
      to: "Todos",
      text: "entra na sala..",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });
    res.sendStatus(201);
  } catch (err) {
    console.log(err);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const coleçãodparticipants = db.collection("participants");
    res.send(await coleçãodparticipants.find().toArray());
  } catch (err) {
    console.log(err);
    res
      .status(422)
      .send(
        "Não foi possível retornar a lista de participantes. Consulte os logs."
      );
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;

  const { user } = req.headers;

  try {
    const participantExist = await coleçãodparticipants.findOne({
      name: user,
    });

    if (!participantExist) {
      return res.status(422).send("Participante não existe!");
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

    await ColeçãodMensagens.insertOne({
      to: to,
      text: text,
      type: type,
      from: user,
      time: dayjs().format("HH:mm:ss"),
    });
    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(400);
  }
});

app.get("/messages", async (req, res) => {
  const limit = req.query.limit;
  const { user } = req.headers;

  try {
    const messages = await ColeçãodMensagens.find().toArray();
    const filteredMessages = messages.filter((m) => {
      if (
        m.type === "message" ||
        m.type === "status" ||
        (m.type === "private_message" && (m.to === user || m.from === user))
      ) {
        return m;
      }
    });
    if (!limit) {
      return res.send(filteredMessages);
    }
    res.send(filteredMessages);
  } catch (err) {
    console.log(err);
    res
      .status(422)
      .send(
        "Não foi possível retornar a lista de mensagens. Consulte os logs."
      );
  }
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;

  try {
    const participantExist = await coleçãodparticipants.findOne({
      name: user,
    });
    if (!participantExist) {
      return res.status(404).send("Participante não cadastrado!");
    }
    await coleçãodparticipants.updateOne(
      { _id: ObjectId(participantExist._id) },
      { $set: { lastStatus: Date.now() } }
    );
    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.send(
      "Não foi possível mostrar o status desse usuário. Consulte os logs."
    );
  }
});

setInterval(deleteInatives, 15000);

async function deleteInatives() {
  const allUsers = await coleçãodparticipants.find().toArray();

  allUsers.forEach(async (u) => {
    if (!u.name) {
      return;
    }
    if (u.lastStatus <= Date.now() - 10000) {
      await coleçãodparticipants.deleteOne({
        _id: ObjectId(u._id),
      });
      await ColeçãodMensagens.insertOne({
        from: u.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss"),
      });
    }
  });
}

app.listen(5000, () => {
  console.log("O servidor está sendo executado na porta 5000");
});