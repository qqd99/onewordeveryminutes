"""Build shared vocabulary rows from published, concept-aligned source lists.

Usage: python scripts/build-language-columns.py INPUT_DIRECTORY
Required inputs are documented in web/dictionary/README.md.
No network requests are made by this script. Node canonicalizes language tags.
"""

import csv
import hashlib
import json
import sys
import subprocess
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1]
inputs = Path(sys.argv[1])
output = root / "web" / "dictionary" / "concepts.json"
WOLD_SNAPSHOT = "1df62b9bdc7292b35982aea49b4d5bd1951f6f3e"


def read(name, delimiter=","):
    with (inputs / name).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter=delimiter))


def digest(name):
    return hashlib.sha256((inputs / name).read_bytes()).hexdigest()


sources = {
    "ids-4.4": {
        "name": "Intercontinental Dictionary Series, Mary Ritchie Key and Bernard Comrie (eds.), v4.4; individual vocabulary authors listed in LANGUAGES.md",
        "url": "https://github.com/intercontinental-dictionary-series/ids/tree/v4.4",
        "license": "CC-BY-4.0", "review": "published-human-edited",
        "sha256": {name: digest(name) for name in ["forms.csv", "parameters.csv", "languages.csv"]},
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
sources["wold-2009"] = {
    "name": "World Loanword Database, Martin Haspelmath and Uri Tadmor (eds.), 2009; individual vocabulary authors listed in LANGUAGES.md",
    "url": "https://github.com/lexibank/wold/tree/" + WOLD_SNAPSHOT,
    "license": "CC-BY-4.0", "review": "published-human-edited",
    "sha256": {name: digest(name) for name in [
        "wold-forms.csv", "wold-parameters.csv", "wold-languages.csv",
        "wold-contributor.csv", "wold-contributioncontributor.csv",
    ]},
}
for source in sources.values():
    source["retrieved"] = "2026-11-09"

ids_languages = read("languages.csv")
wold_languages = read("wold-languages.csv")
iso_codes = sorted({item["ISO639P3code"] for item in ids_languages + wold_languages} - {""})
canonical = json.loads(subprocess.check_output([
    "node", "-e", "process.stdout.write(JSON.stringify(Object.fromEntries(JSON.parse(process.argv[1]).map(code => [code, Intl.getCanonicalLocales(code)[0]]))))",
    json.dumps(iso_codes),
], text=True))
language_names = {"zh-CN": "Chinese (Mandarin)", "es": "Spanish", "en": "English", "vi": "Vietnamese", "it": "Italian"}
language_details = {
    "zh-CN": {"representation": "Published Chinese script", "speechLang": "zh-CN", "authors": "Sun and others; Concepticon contributors"},
    "vi": {"representation": "Published Vietnamese spelling", "speechLang": "vi", "authors": "Annika Tjuka"},
}
iso_counts = defaultdict(int)
for item in ids_languages:
    iso_counts[item["ISO639P3code"]] += 1
languages = {}
for item in ids_languages:
    iso = item["ISO639P3code"]
    base = canonical.get(iso, "und")
    code = base
    # Keep source varieties distinct. Reserve Thai's base tag for native script.
    if not iso or iso_counts[iso] > 1 or base in {"th", "vi", "zh"}:
        code = f"{base}-x-ids-{item['ID']}"
    languages[item["ID"]] = code
    profile = item["Representations"].split(";")[0]
    representation = {
        "StandardOrth": "Published spelling", "StandardOrthTone": "Published spelling with tones",
        "Standard": "Published spelling", "StandOrth": "Published spelling",
        "Phonemic": "Phonemic transcription", "phonetic": "Phonetic transcription",
        "CyrillTrans": "Cyrillic transcription", "LatinTrans": "Latin transcription", "IPA": "IPA transcription",
    }.get(profile, "Published source representation")
    language_names[code] = item["Name"]
    language_details[code] = {
        "representation": representation, "sourceRepresentation": item["Representations"],
        "speechLang": base, "glottocode": item["Glottocode"], "iso639P3": iso,
        "authors": item["Authors"], "sourceUrl": "https://ids.clld.org/contributions/" + item["ID"],
    }

wold_authors = {item["pk"]: item["name"] for item in read("wold-contributor.csv")}
contributions = defaultdict(list)
for item in read("wold-contributioncontributor.csv"):
    contributions[item["contribution_pk"]].append((int(item["ord"] or 0), wold_authors[item["contributor_pk"]]))
wold_codes = {}
native_scripts = {"Japanese", "MandarinChinese", "Thai", "KildinSaami"}
for item in wold_languages:
    base = canonical.get(item["ISO639P3code"], "und")
    code = {"MandarinChinese": "zh-CN", "Vietnamese": "vi"}.get(item["ID"], base)
    # Reuse a standard-spelling column only for the same published variety.
    same = next((language for language in ids_languages
                 if language["Glottocode"] == item["Glottocode"]
                 and language["Representations"].split(";")[0] == "StandardOrth"), None)
    if same:
        code = languages[same["ID"]]
    elif (code in language_names and code not in {"vi", "zh-CN"}) or code == "und":
        code = f"{base}-x-wold-{item['WOLD_ID']}"
    wold_codes[item["ID"]] = code
    if code not in language_names:
        suffix = " (WOLD variety)" if base in language_names else ""
        language_names[code] = item["Name"] + suffix
        language_details[code] = {
            "representation": "Published native script" if item["ID"] in native_scripts else "Published spelling / transcription",
            "speechLang": base, "glottocode": item["Glottocode"], "iso639P3": item["ISO639P3code"],
        }
    detail = language_details[code]
    authors = ", ".join(name for _, name in sorted(contributions[item["WOLD_ID"]]))
    detail["woldAuthors"] = authors
    detail["woldUrl"] = "https://wold.clld.org/vocabulary/" + item["WOLD_ID"]

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

# Join two source lists only through a unique Concepticon identifier on both
# sides. Otherwise preserve WOLD's own sense row and its missing language cells.
wold_parameters = read("wold-parameters.csv")
wold_concepts = defaultdict(list)
for parameter in wold_parameters:
    if parameter["Concepticon_ID"]:
        wold_concepts[parameter["Concepticon_ID"]].append(parameter["ID"])
wold_rows = {}
for parameter in wold_parameters:
    concept = parameter["Concepticon_ID"]
    matching = concept_ids.get(concept, [])
    if len(matching) == 1 and len(wold_concepts[concept]) == 1:
        wold_rows[parameter["ID"]] = rows[matching[0]]
    else:
        row = {"id": "wold:" + parameter["ID"], "label": parameter["Name"], "conceptId": concept, "cells": {}}
        rows[row["id"]] = row
        wold_rows[parameter["ID"]] = row

existing_cells = {(row["id"], code) for row in rows.values() for code in row["cells"]}
for form in read("wold-forms.csv"):
    code = wold_codes[form["Language_ID"]]
    row = wold_rows[form["Parameter_ID"]]
    if (row["id"], code) in existing_cells:
        continue
    native = form["Language_ID"] in native_scripts
    word = form["original_script"] if native else form["Value"].replace("_", " ")
    add_cell(row, code, word, "wold-2009", form["ID"], form["Comment"])
    if word and native:
        row["cells"][code].setdefault("reading", form["Value"].replace("_", " "))

selected = [row for row in rows.values() if len(row["cells"]) >= 2]
present = {code for row in selected for code in row["cells"]}
language_names = dict(sorted(((code, name) for code, name in language_names.items() if code in present), key=lambda item: item[1].casefold()))
for code in language_names:
    language_details[code]["concepts"] = sum(code in row["cells"] for row in selected)
# Compact the additional columns while retaining the original five columns in
# the existing row format. The browser expands only selected language columns.
columns = defaultdict(dict)
cell_count = sum(len(row["cells"]) for row in selected)
for row in selected:
    for code in list(row["cells"]):
        if code in {"it", "en", "es", "vi", "zh-CN"}:
            continue
        cell = row["cells"].pop(code)
        source_ids = {credit["id"] for credit in cell["sources"]}
        if len(source_ids) != 1:
            raise ValueError("Compact cells require a single published source")
        columns[code][row["id"]] = [cell["forms"], source_ids.pop(),
                                   [credit["key"] for credit in cell["sources"]],
                                   cell.get("reading", ""), cell.get("notes", [])]
board = {"languages": language_names, "languageDetails": language_details, "sources": sources,
         "rows": selected, "columns": {code: json.dumps(cells, ensure_ascii=False, separators=(",", ":"))
                                         for code, cells in columns.items()}}
output.write_text(json.dumps(board,
                             ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
catalog_path = output.with_name("catalog.json")
catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
catalog.update({"languages": language_names, "languageDetails": language_details})
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

inventory = ["# Published language columns", "", "Generated from the pinned source inventories. Counts describe populated concept cells. Transcriptions retain the source's writing conventions. Individual source varieties have separate column identifiers.", "", "| Language | Column | Concepts | Representation | Vocabulary authors |", "| --- | --- | --- | --- | --- |"]
for code, name in language_names.items():
    detail = language_details[code]
    authors = detail.get("authors", "")
    if detail.get("woldAuthors"):
        authors += (" / " if authors else "") + detail["woldAuthors"]
    url = detail.get("sourceUrl") or detail.get("woldUrl") or sources["tjuka-2024" if code == "vi" else "concepticon-sun-1991"]["url"]
    inventory.append(f"| [{name}]({url}) | `{code}` | {detail['concepts']} | {detail['representation']} | {authors.replace('|', '/')} |")
output.with_name("LANGUAGES.md").write_text("\n".join(inventory) + "\n", encoding="utf-8")
print("Shared rows", len(selected))
print("Language columns", len(language_names), "Cells", cell_count)
print("Output bytes", output.stat().st_size)
