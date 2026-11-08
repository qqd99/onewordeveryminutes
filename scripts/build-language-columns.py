"""Build shared vocabulary rows from published, concept-aligned source lists.

Usage: python scripts/build-language-columns.py INPUT_DIRECTORY
Required inputs: forms.csv, parameters.csv, Tjuka-2024-1310.tsv,
Sun-1991-1004.tsv. No network requests are made by this script.
"""

import csv
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1]
inputs = Path(sys.argv[1])
output = root / "web" / "dictionary" / "concepts.json"


def read(name, delimiter=","):
    with (inputs / name).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter=delimiter))


def digest(name):
    return hashlib.sha256((inputs / name).read_bytes()).hexdigest()


sources = {
    "ids-4.4": {
        "name": "Intercontinental Dictionary Series, Key and Comrie (eds.), v4.4; Italian by Martin Maiden; English by various contributors; Spanish by Joan Rafel and contributors",
        "url": "https://github.com/intercontinental-dictionary-series/ids/tree/v4.4",
        "license": "CC-BY-4.0", "review": "published-human-edited",
        "sha256": {name: digest(name) for name in ["forms.csv", "parameters.csv"]},
    },
    "tjuka-2024": {
        "name": "Annika Tjuka (2024), Concept list of Vietnamese based on IDS",
        "url": "https://doi.org/10.5281/zenodo.11482543",
        "license": "CC-BY-4.0", "review": "published-human-edited",
        "sha256": digest("Tjuka-2024-1310.tsv"),
    },
    "concepticon-sun-1991": {
        "name": "Sun and others (1991), Chinese labels and concept mappings curated by Concepticon contributors",
        "url": "https://concepticon.clld.org/contributions/Sun-1991-1004",
        "snapshot": "7b5af5fcb18113ecc3b60129bc68d08594f2596e",
        "license": "CC-BY-4.0", "review": "published-human-edited",
        "sha256": digest("Sun-1991-1004.tsv"),
    },
}
for source in sources.values():
    source["retrieved"] = "2026-11-08"

rows = {}
concept_ids = defaultdict(list)
for parameter in read("parameters.csv"):
    rows[parameter["ID"]] = {
        "id": "ids:" + parameter["ID"], "label": parameter["Name"],
        "conceptId": parameter["Concepticon_ID"], "cells": {},
    }
    if parameter["Concepticon_ID"]:
        concept_ids[parameter["Concepticon_ID"]].append(parameter["ID"])


def add_cell(row, language, form, source_id, source_key, notes=""):
    if not form or form.strip() in {"-", "?", "—"}:
        return
    cell = row["cells"].setdefault(language, {"forms": [], "sources": []})
    if form not in cell["forms"]:
        cell["forms"].append(form)
    credit = {"id": source_id, "key": source_key}
    if credit not in cell["sources"]:
        cell["sources"].append(credit)
    if notes:
        cell.setdefault("notes", []).append(notes)


languages = {"170": "it", "190": "en", "176": "es"}
for form in read("forms.csv"):
    if form["Language_ID"] in languages and form["Parameter_ID"] in rows:
        add_cell(rows[form["Parameter_ID"]], languages[form["Language_ID"]],
                 form["Form"], "ids-4.4", form["ID"], form["Comment"])

for item in read("Tjuka-2024-1310.tsv", "\t"):
    row = rows.get(item["IDS_KEY"])
    if row:
        add_cell(row, "vi", item["VIETNAMESE"], "tjuka-2024", item["ID"])

# Follow published Concepticon identifiers only when they identify one IDS row.
# Spelling and English-gloss similarity never create alignments.
for item in read("Sun-1991-1004.tsv", "\t"):
    matching = concept_ids.get(item["CONCEPTICON_ID"], [])
    if len(matching) == 1:
        add_cell(rows[matching[0]], "zh-CN", item["CHINESE"],
                 "concepticon-sun-1991", item["ID"])

selected = [row for row in rows.values() if len(row["cells"]) >= 2]
output.write_text(json.dumps({"sources": sources, "rows": selected},
                             ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print("Shared rows", len(selected))
for language in ["it", "en", "es", "vi", "zh-CN"]:
    print(language, sum(language in row["cells"] for row in selected))
