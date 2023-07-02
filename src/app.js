import express from "express";
import cors from "cors";
import chalk from "chalk"
import { MongoClient } from "mongodb";
import dotenv from 'dotenv'
import joi from 'joi'
import dayjs from 'dayjs'

dotenv.config()

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
  mongoClient.connect()
  db = mongoClient.db();
  console.log('Conectou com o mongodb!')
} catch (error) {
  console.log('Deu erro no banco de dados!')
}


const app = express();
const time = Date.now();
const timestamp = dayjs(time).format("HH:mm:ss");


app.use(cors());
app.use(express.json());

app.post("/participants", async (req, res) => {

  const usuario = req.body;

  const usuarioSchema = joi.object({ name: joi.string().required() })

  const validation = usuarioSchema.validate(usuario)
  if (validation.error) return res.status(422).send('Preencha o campo com nome!')

  try {
    const usuarioExiste = await db.collection("participants").findOne({ name: usuario.name })
    if (usuarioExiste) return res.status(409).send("Esse usuário já existe")


    await db.collection("participants").insertOne({ name: usuario.name, lastStatus: time })
    await db.collection("messages").insertOne({
      from: usuario.name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: timestamp,
    });

    return res.status(201).send("Usuário Registrado!");

  } catch (err) {
    return res.status(500).send(err.message)
  }
})

app.get("/participants", async (req, res) => {
  const usuarios = await db.collection("participants").find().toArray()

  return res.status(200).send(usuarios)

})

app.post("/messages", async (req, res) => {

  const { to, text, type } = req.body;
  let { user } = req.headers;

  const mensagemSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().required().valid("message", "private_message"),
    from: joi.string().required()

  })

  const validation = mensagemSchema.validate({ to, text, type, from: user })
  if (validation.error) return res.status(422).send()

  const usuarioExiste = await db.collection("participants").findOne({ name: user })
  if (!usuarioExiste) return res.status(422).send("Esse usuário não existe")

  try {
    await db.collection("messages").insertOne({
      from: user,
      to,
      text,
      type,
      time: timestamp

    })
    return res.status(201).send("Mensagem enviada")

  } catch (err) {
    res.status(422).send("Deu algo errado no servidor!")
  }
})

app.get("/messages", async (req, res) => {
  const limite=req.query.limit;
  const {user}=req.headers;

  try{
      const mensagens = await db.collection("messages").find({ $or: [{ from: user }, { to: "Todos" }, { to: user }] }).toArray();
      
      if (!limite) return res.send(mensagens);
      
      if (limite > 0 && parseInt(limite)!== "NaN") {
          const dados = mensagens.reverse().slice(0, parseInt(limite));
          return res.send(dados);
      }else{
          return res.sendStatus(422);
      }
      
  }catch(error){
      res.status(500).send(error.message);
  } 

})

app.post("/status", async (req, res) => {
  
  let { user } = req.headers;

  const usuarioExiste = await db.collection("participants").findOne({ name: user })
  if (!usuarioExiste){ return res.status(404).send("Usuario não existe")}

  try {
    await db.collection("participants").updateOne(
      { name: user },
      { $set: { lastStatus: Date.now() }});

    return res.status(200).send();

  } catch {
    return res.status(422).send();
  }
})

setInterval(async ()=>{
  const segundos =Date.now()-10000;

  try{
      const inativos=await db.collection("participants").find({lastStatus: {$lte: segundos}}).toArray();

      if(inativos.length>0){
          const msgInativos=inativos.map(
              (inativo)=>{
                  return {
                      from: inativo.name,
                      to: "Todos",
                      text: "sai da sala...",
                      type: "status",
                      time: dayjs().format("HH:mm:ss")
                  };

              }
          );

          await db.collection("messages").insertMany(msgInativos);
          await db.collection("participants").deleteMany({lastStatus: {$lte: segundos}});
      }
  }catch(error){
      res.status(500).send(error.message);
  }
},15000);


app.listen(5000, () => {
  console.log(chalk.blue('Servidor Funcionando na porta 5000'));
})