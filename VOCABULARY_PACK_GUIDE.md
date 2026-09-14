# Vocabulary pack guide

`vocabulary.json` is the extension's single vocabulary source. Each card should keep a permanent `id`; changing that ID disconnects the card from its saved SRS progress.

## Card format

```json
{
  "id": "zh-0001",
  "front": "你好",
  "reading": "nǐ hǎo",
  "meaning": "hello",
  "example": {
    "text": "你好，很高兴认识你。",
    "reading": "nǐ hǎo, hěn gāoxìng rènshi nǐ.",
    "meaning": "Hello, nice to meet you.",
    "source": "original"
  }
}
```

The automatic sequence reads `front` twice and then `example.text` twice. `speechText`, `speechLang`, `example.speechText`, and `example.speechLang` are optional overrides.

## Pack format

```json
{
  "id": "fr-core-1000",
  "name": "French Core 1000",
  "language": "French",
  "languageCode": "fr-FR",
  "translationLanguage": "English",
  "speechLang": "fr-FR",
  "frontLabel": "French",
  "readingLabel": "Pronunciation",
  "meaningLabel": "English meaning",
  "exampleLabel": "Common sentence",
  "exampleReadingLabel": "Sentence pronunciation",
  "exampleMeaningLabel": "Sentence meaning",
  "cards": [
    {
      "id": "fr-0001",
      "front": "bonjour",
      "reading": "",
      "meaning": "hello",
      "example": {
        "text": "Bonjour, comment allez-vous ?",
        "reading": "",
        "meaning": "Hello, how are you?",
        "source": "original"
      }
    }
  ]
}
```

Add another pack object to the top-level `packs` array. The popup creates a pack selector automatically.

## Progress safety

- Never reuse one card ID for a different word.
- Never change an existing ID when correcting spelling, meaning, or an example.
- Add new cards with new unique IDs.
- Update by replacing files in the currently loaded folder and pressing **Reload** in Edge.
