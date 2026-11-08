"""Build offline dictionaries from local, published source files.

This conversion script is licensed under GNU GPL version 2 or later.

Usage: python scripts/build-dictionary.py INPUT_DIRECTORY
Source URLs and SHA-256 hashes are written to dictionary/catalog.json.
"""

import gzip
import hashlib
import json
import re
import shutil
import sys
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(sys.argv[1])
OUTPUT = ROOT / "web" / "dictionary"
OUTPUT.mkdir(parents=True, exist_ok=True)


def write_json(name, value):
    (OUTPUT / name).write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )


sources = {}


def source(source_id, name, filename, url, license_id):
    sources[source_id] = {
        "name": name, "url": url, "license": license_id,
        "review": "published-human-edited",
        "sha256": hashlib.sha256((INPUT / filename).read_bytes()).hexdigest(),
        "retrieved": "2026-11-08",
    }


source("cedict", "CC-CEDICT contributors", "cedict.gz",
       "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz", "CC-BY-SA-4.0")
cedict = []
with gzip.open(INPUT / "cedict.gz", "rt", encoding="utf-8") as handle:
    for line in handle:
        match = re.fullmatch(r"(\S+) (\S+) \[([^]]+)\] /(.+)/\s*", line)
        if not match:
            continue
        traditional, simplified, reading, glosses = match.groups()
        cedict.append({
            "headword": simplified, "aliases": [traditional] if traditional != simplified else [],
            "reading": reading, "key": f"{traditional}|{simplified}[{reading}]",
            "senses": [{"gloss": gloss} for gloss in glosses.split("/") if gloss],
        })
write_json("zh-en.json", {"sourceId": "cedict", "entries": cedict})

source("freedict-spa-eng", "FreeDict Spanish-English 0.3.1 contributors", "spa-eng.tei",
       "https://raw.githubusercontent.com/freedict/fd-dictionaries/master/spa-eng/spa-eng.tei", "GPL-2.0-or-later")
ns = {"t": "http://www.tei-c.org/ns/1.0"}
spanish = []
for entry in ET.parse(INPUT / "spa-eng.tei").findall(".//t:body/t:entry", ns):
    word = entry.findtext("t:form/t:orth", namespaces=ns)
    senses = []
    for sense in entry.findall("t:sense", ns):
        gloss = "; ".join("".join(quote.itertext()).strip()
                          for quote in sense.findall(".//t:quote", ns))
        if gloss:
            senses.append({"gloss": gloss})
    if word and senses:
        spanish.append({"headword": word, "senses": senses})
write_json("es-en.json", {"sourceId": "freedict-spa-eng", "entries": spanish})


def wiktionary(filename, page, source_id, chinese=False):
    url = f"https://kaikki.org/viwiktionary/{page}/kaikki.org-dictionary-{page.replace('%20', '')}.jsonl"
    source(source_id, "Vietnamese Wiktionary contributors via Kaikki/Wiktextract",
           filename, url, "CC-BY-SA-4.0")
    entries = []
    redirects = []
    for line in (INPUT / filename).read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        word = row.get("word", "")
        if row.get("pos") == "romanization" or (chinese and not re.search(r"[\u3400-\u9fff]", word)):
            continue
        senses = []
        for index, sense in enumerate(row.get("senses", [])):
            if "no-gloss" in sense.get("tags", []):
                continue
            gloss = " · ".join(sense.get("glosses", []))
            if not gloss:
                continue
            senses.append({
                "id": sense.get("id", str(index)), "gloss": gloss,
                "partOfSpeech": row.get("pos", ""), "labels": sense.get("tags", []),
                "examples": [{"text": ex["text"], "meaning": ex["translation"]}
                             for ex in sense.get("examples", []) if ex.get("text") and ex.get("translation")],
            })
        if senses:
            entries.append({"headword": word, "senses": senses,
                            "sourceUrl": "https://vi.wiktionary.org/wiki/" + urllib.parse.quote(word, safe="")})
        for redirect in row.get("redirects", []):
            redirects.append((word, redirect))
    # Only explicit source redirects become aliases. No inferred translations.
    by_word = {}
    for entry in entries:
        by_word.setdefault(entry["headword"], []).append(entry)
    for word, redirect in redirects:
        for entry in by_word.get(redirect, []):
            entry.setdefault("aliases", []).append(word)
    write_json(source_id + ".json", {"sourceId": source_id, "entries": entries})
    return entries


wiktionary("mandarin-vi.jsonl", "Ti%E1%BA%BFng%20Quan%20Tho%E1%BA%A1i", "cmn-vi", True)
wiktionary("chinese-vi.jsonl", "Ti%E1%BA%BFng%20Trung%20Qu%E1%BB%91c", "zh-vi", True)
spanish_vi = wiktionary("spanish-vi.jsonl", "Ti%E1%BA%BFng%20T%C3%A2y%20Ban%20Nha", "es-vi")

# Supplement the existing Spanish study headwords where FreeDict has no entry.
source("wikdict-spa-eng", "WikDict by Karl Bartel; Wiktionary contributors via DBnary",
       "wikdict-spa-eng.tei", "https://download.wikdict.com/dictionaries/tei/recommended/spa-eng.tei",
       "CC-BY-SA-3.0")
known_spanish = {entry["headword"].lower() for entry in spanish}
missing_spanish = {entry["headword"].lower() for entry in spanish_vi} - known_spanish
supplement = []
for entry in ET.parse(INPUT / "wikdict-spa-eng.tei").findall(".//t:body/t:entry", ns):
    word = entry.findtext("t:form/t:orth", namespaces=ns)
    if not word or word.lower() not in missing_spanish:
        continue
    senses = []
    for sense in entry.findall("t:sense", ns):
        gloss = "; ".join("".join(quote.itertext()).strip()
                          for quote in sense.findall("t:cit[@type='trans']/t:quote", ns))
        if gloss:
            senses.append({
                "gloss": gloss,
                "partOfSpeech": entry.findtext("t:gramGrp/t:pos", default="", namespaces=ns),
                "sourceDefinition": " · ".join("".join(definition.itertext()).strip()
                                                for definition in sense.findall(".//t:def", ns)),
            })
    if senses:
        supplement.append({"headword": word, "senses": senses})
write_json("es-en-wikdict.json", {"sourceId": "wikdict-spa-eng", "entries": supplement})

(OUTPUT / "sources").mkdir(exist_ok=True)
shutil.copyfile(INPUT / "spa-eng.tei", OUTPUT / "sources" / "spa-eng.tei")
shutil.copyfile(INPUT / "GPL-2.0.txt", OUTPUT / "sources" / "GPL-2.0.txt")
shutil.copyfile(Path(__file__), OUTPUT / "sources" / "build-dictionary.py")
write_json("catalog.json", {
    "schemaVersion": 1,
    "languages": {"zh-CN": "Chinese (Mandarin)", "es": "Spanish", "en": "English", "vi": "Vietnamese"},
    "sources": sources,
    "pairs": [
        {"source": "zh-CN", "target": "en", "files": ["zh-en.json"]},
        {"source": "zh-CN", "target": "vi", "files": ["cmn-vi.json", "zh-vi.json"]},
        {"source": "es", "target": "en", "files": ["es-en.json", "es-en-wikdict.json"]},
        {"source": "es", "target": "vi", "files": ["es-vi.json"]},
    ],
    "studyPacks": [{"id": "es-dictionary", "languageCode": "es", "name": "Spanish dictionary"}],
})
for path in OUTPUT.glob("*.json"):
    print(path.name, path.stat().st_size)
