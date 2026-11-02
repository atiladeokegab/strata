"""Small, local retrieval over the place graph's public document shape."""
import json
import math
import os
import re

from openai import AsyncOpenAI, OpenAIError

STOP_WORDS = set("a an and are as at be bridge by can do does did during for how i in is it me of on or tell the this to was were what when which who why with you".split())
ALIASES = {"tall": "height", "high": "height", "opened": "open", "opening": "open", "built": "construction", "took": "take", "work": "hydraulic", "works": "hydraulic"}
EMBEDDING_MODEL = "text-embedding-3-small"
_cache = {}


def terms(text):
    return {ALIASES.get(word, word).removesuffix("s") for word in re.findall(r"[\w-]+", text.casefold()) if word not in STOP_WORDS}


def documents(place):
    for part in place.get("parts", []):
        yield {"kind": "part", "id": part["id"], "title": part["name"],
               "snippet": part.get("summary", "")}, part
    for event in place.get("events", []):
        yield {"kind": "event", "id": str(event.get("id", event["year"])),
               "title": f'{event["year"]} · {event["title"]}', "snippet": event.get("text", "")}, event
    for source in place.get("sources", []):
        yield {"kind": "source", "id": source["id"], "title": source["title"],
               "snippet": source.get("url", "")}, source


def ranked(place, question):
    query = terms(question)
    matches = []
    for document, record in documents(place):
        title_score = len(query & terms(document["title"]))
        score = 3 * title_score + len(query & terms(json.dumps(record)))
        if score:
            matches.append((score, document, record))
    matches.sort(key=lambda match: -match[0])
    return [(document, record) for _, document, record in matches]


def search(place, question, limit=20):
    return [document for document, _ in ranked(place, question)[:limit]]


def _text(document):
    return f"{document['title']}. {document['snippet']}"[:8000]


def _signature(docs):
    return tuple(_text(document) for document in docs)


async def _embed(texts, client=None):
    if client is None:
        async with AsyncOpenAI(timeout=8, max_retries=0) as client:
            response = await client.embeddings.create(model=EMBEDDING_MODEL, input=texts, timeout=8)
    else:
        response = await client.embeddings.create(model=EMBEDDING_MODEL, input=texts, timeout=8)
    return [item.embedding for item in sorted(response.data, key=lambda item: item.index)]


async def warm_search(place, client=None):
    """Embed this place's documents once at startup; failure leaves keyword search ready."""
    docs = [document for document, _ in documents(place)]
    signature = _signature(docs)
    key = place["id"]
    if (client is None and not os.getenv("OPENAI_API_KEY")) or (_cache.get(key) or (None,))[0] == signature:
        return
    try:
        vectors = await _embed([_text(document) for document in docs], client)
        if len(vectors) == len(docs):
            _cache[key] = signature, docs, vectors
    except (OpenAIError, TimeoutError, OSError):
        _cache.pop(key, None)


async def semantic_search(place, question, limit=20, client=None):
    docs = [document for document, _ in documents(place)]
    signature = _signature(docs)
    cached = _cache.get(place["id"])
    if (client is None and not os.getenv("OPENAI_API_KEY")) or not cached or cached[0] != signature or not question.strip():
        return search(place, question, limit)
    try:
        query = (await _embed([question], client))[0]
        query_norm = math.sqrt(sum(value * value for value in query))
        if not query_norm:
            return search(place, question, limit)
        _, indexed_docs, vectors = cached
        scored = []
        for document, vector in zip(indexed_docs, vectors):
            norm = math.sqrt(sum(value * value for value in vector))
            score = sum(left * right for left, right in zip(query, vector)) / (query_norm * norm) if norm else -1
            if score >= 0.15:
                scored.append((score, document))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [document for _, document in scored[:limit]] if scored else search(place, question, limit)
    except (OpenAIError, TimeoutError, OSError, IndexError, ZeroDivisionError):
        return search(place, question, limit)
