import ollama from "ollama";
import pg from "pg";
import { readFileSync } from "node:fs";
import { chunk } from "./chunk.ts";

// Use YOUR connection address from the setup step
process.loadEnvFile("../.env");

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL_POOLED,
});

await db.connect();

// Setup (given): turn on pgvector and create the table, only if they don't exist yet
await db.query("CREATE EXTENSION IF NOT EXISTS vector");
await db.query(`
  CREATE TABLE IF NOT EXISTS chunks (
    id          SERIAL PRIMARY KEY,   -- a unique number for every row, made automatically
    source      TEXT NOT NULL,        -- which file the piece came from
    chunk_index INT NOT NULL,         -- the piece's number inside that file
    content     TEXT NOT NULL,        -- the piece's words
    embedding   VECTOR(768) NOT NULL  -- its address (768 numbers)
  )`);

const source = "handbook.txt";
const pieces = chunk(readFileSync("./" + source, "utf8"));

// TODO 1: get the addresses for all pieces in one request
//   (exactly like Lesson 3 TODO 2, with the "search_document: " label). Call the result `vectors`.

// TODO 2: delete this file's old rows first, so running ingest twice doesn't save everything twice
//   SQL: DELETE FROM chunks WHERE source = $1      values: [source]

// TODO 3: save every piece with its address, one row each (a for loop over pieces)
//   SQL: INSERT INTO chunks (source, chunk_index, content, embedding) VALUES ($1, $2, $3, $4)
//   values: [source, i, pieces[i], JSON.stringify(vectors[i])]

console.log(`Saved ${pieces.length} pieces from ${source}`);
await db.end();
