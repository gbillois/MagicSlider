# MagicSlider

MagicSlider is a standalone local HTML application for creating AI-assisted slide decks, editing them on a PowerPoint-like canvas, and exporting them as PPTX or standalone HTML.

## Run locally

Open `index.html` directly in a browser, or serve the folder with:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.

## Main features

- `Create`: generate a deck from a prompt using the LLM configured in `Settings`.
- `Modify`: edit slides, text blocks, shapes, selections, images from URL, and slide templates.
- `Export`: export to PPTX or standalone HTML.
- `Settings`: configure Anthropic, OpenAI, Azure OpenAI, Google Gemini, or Mistral with dynamic model loading and connection testing.

## PPTX export

The PPTX export follows the mechanism used in `HowToWavestone/CTI.html`: slides are rebuilt as editable PowerPoint objects with `PptxGenJS`, while image/photo blocks are captured from the browser with `html2canvas` before being inserted into the deck.

External images must be reachable by the browser and CORS-compatible for best export fidelity.
