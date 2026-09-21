import os
import json
import math
import sqlite3
from typing import List
from fastapi import FastAPI
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
)


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "clips.db")

print(f"[cliphistory] using database: {os.path.abspath(DB_PATH)}")

db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.execute(
    "CREATE TABLE IF NOT EXISTS clips ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT, "
    "content TEXT NOT NULL, "
    "created_at TEXT, "
    "category TEXT, "
    "tag TEXT, "
    "title TEXT, "
    "tags TEXT, "
    "embedding TEXT"
    ");"
)
for column in ("title TEXT", "tags TEXT", "embedding TEXT"):
    try:
        db.execute(f"ALTER TABLE clips ADD COLUMN {column}")
    except sqlite3.OperationalError:
        pass
db.commit()


class TagRequest(BaseModel):
    content: str
    created_at: str | None = None

@app.post("/tag")
def tag(data: TagRequest):
    existing = db.execute(
        "SELECT id, title, tags FROM clips WHERE content = ? ORDER BY id DESC LIMIT 1",
        (data.content,),
    ).fetchone()
    if existing:
        existing_id, existing_title, existing_tags = existing
        db.execute(
            "UPDATE clips SET created_at = ? WHERE id = ?",
            (data.created_at, existing_id),
        )
        db.commit()
        return {
            "id": existing_id,
            "title": existing_title or "Clipboard",
            "tags": json.loads(existing_tags) if existing_tags else [],
        }

    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=f"""Return only a JSON object with two fields:
"title": a short 2 to 6 word title describing this text,
"tags": an array of 1 to 3 short lowercase tags.

Text:
{data.content}"""
    )
    parsed = json.loads(response.text)
    title = parsed.get("title", "Clipboard")
    tags = parsed.get("tags", [])

    embedding = client.models.embed_content(
        model="gemini-embedding-001",
        contents=data.content,
    ).embeddings[0].values

    cur = db.execute(
        "INSERT INTO clips (content, created_at, title, tags, embedding) VALUES (?, ?, ?, ?, ?)",
        (data.content, data.created_at, title, json.dumps(tags), json.dumps(embedding)),
    )
    db.commit()

    return {"id": cur.lastrowid, "title": title, "tags": tags}


@app.get("/clips")
def list_clips():

    rows = db.execute(
        "SELECT id, content, created_at, title, tags FROM clips ORDER BY id DESC"
    ).fetchall()
    return {
        "clips": [
            {
                "id": row_id,
                "content": content,
                "created_at": created_at,
                "title": title or "Clipboard",
                "tags": json.loads(tags) if tags else [],
            }
            for row_id, content, created_at, title, tags in rows
        ]
    }


@app.delete("/clips/{clip_id}")
def delete_clip(clip_id: int):
    cur = db.execute("DELETE FROM clips WHERE id = ?", (clip_id,))
    db.commit()
    return {"deleted": clip_id, "found": cur.rowcount > 0}


class UpdateClipRequest(BaseModel):
    content: str

@app.put("/clips/{clip_id}")
def update_clip(clip_id: int, data: UpdateClipRequest):
    embedding = None
    try:
        embedding = client.models.embed_content(
            model="gemini-embedding-001",
            contents=data.content,
        ).embeddings[0].values
    except Exception:
        pass

    if embedding is not None:
        cur = db.execute(
            "UPDATE clips SET content = ?, embedding = ? WHERE id = ?",
            (data.content, json.dumps(embedding), clip_id),
        )
    else:
        cur = db.execute(
            "UPDATE clips SET content = ? WHERE id = ?",
            (data.content, clip_id),
        )
    db.commit()
    return {"updated": clip_id, "found": cur.rowcount > 0}


def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class SearchRequest(BaseModel):
    query: str

@app.post("/search")
def search(data: SearchRequest):
    rows = db.execute(
        "SELECT id, content, tags, embedding FROM clips WHERE embedding IS NOT NULL"
    ).fetchall()

    if not rows:
        return {"results": []}

    query_vec = client.models.embed_content(
        model="gemini-embedding-001",
        contents=data.query,
    ).embeddings[0].values

    scored = []
    for row_id, content, tags_json, embedding_json in rows:
        embedding = json.loads(embedding_json)
        scored.append({
            "id": row_id,
            "content": content,
            "tags": json.loads(tags_json) if tags_json else [],
            "score": cosine_similarity(query_vec, embedding),
        })

    scored.sort(key=lambda s: s["score"], reverse=True)

    return {"results": scored}