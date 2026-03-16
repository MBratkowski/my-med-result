# My Med Result

My Med Result is a local app for collecting blood test PDFs, extracting the results with OCR, and showing them in one place so you can compare values over time.

## What This App Does

- Reads PDF lab reports from the `data/` folder.
- Extracts blood test values from those PDFs.
- Shows trends, snapshot comparisons, and the original PDF proof.
- Keeps everything on your computer by default.

## Privacy

- Your PDFs stay on your machine.
- OCR runs locally on your computer.
- Results are stored in a local SQLite database at `storage/med_results.db`.
- Preview images are stored in `preview-cache/`.
- By default, this app does not send your medical data to LLMs or cloud AI services.

## What You Need First

This project is currently easiest to run on macOS.

Install these once:

- `Homebrew`
- `Node.js` and `npm`
- `uv` for Python packages
- `poppler` for `pdfinfo` and `pdftoppm`
- `tesseract`

On macOS, the easiest setup is:

```bash
brew install node uv poppler tesseract
```

`sips` is also used by the app, but it already comes with macOS.

## First-Time Setup

Open Terminal and run these commands once.

First, go to the main project folder, the one that contains `backend/`, `frontend/`, and `data/`.

### 1. Install backend dependencies

```bash
cd backend
uv sync
```

### 2. Install frontend dependencies

```bash
cd ../frontend
npm install
```

## Normal Daily Use

### 1. Put your PDFs into the `data/` folder

Use one folder per report date if possible.

Example:

```text
data/
  2023-07-26/
    Wynik-tsh.pdf
  2024-06-10/
    Wyniki-wszystkie.pdf
```

If you know the report date, use the `YYYY-MM-DD` folder format. That helps the app recover dates when a PDF does not contain one clearly.

### 2. Start the backend

In one Terminal window:

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

Leave that window open.

### 3. Start the frontend

In a second Terminal window:

```bash
cd frontend
npm run dev
```

Leave that window open too.

### 4. Open the app

Open this in your browser:

```text
http://localhost:5173
```

### 5. Import your files

Click `Scan data folder`.

The app will:

- find PDFs in `data/`
- OCR them
- create preview images
- store extracted results in the local database
- remove old database entries for PDFs you deleted from `data/`

## How To Use The App

### Dashboard

The main screen is for browsing approved results.

You can:

- choose one or more analytes from the analyte picker
- compare them in `Trend` mode
- compare the latest report dates in `Snapshot` mode
- click a point on a chart to open the original proof
- click a cell in snapshot view to open the matching PDF proof

### Review

If OCR is uncertain or something looks wrong, use the `Review` tab.

There you can:

- inspect suspicious rows
- correct values, units, dates, or labels
- save the corrected version

### Proof Drawer

When you open a result, the app shows:

- the extracted value
- the original file name
- a preview of the source page
- a full PDF render
- zoom controls for easier reading

Use this when you want to confirm that OCR got the right number.

## Typical Workflow

1. Add new lab PDFs to `data/YYYY-MM-DD/`.
2. Start the backend and frontend.
3. Open `http://localhost:5173`.
4. Click `Scan data folder`.
5. Use the analyte picker to select the blood markers you want to compare.
6. Open the proof drawer for anything that looks suspicious.
7. Use the `Review` tab for OCR mistakes.

## Important Folders

- `data/`  
  Your source PDFs live here.

- `storage/med_results.db`  
  The local database with extracted results.

- `preview-cache/`  
  Generated page preview images for the proof viewer.

## If You Delete Or Rename PDFs

After changing files in `data/`, click `Scan data folder` again.

The app will refresh the database and remove rows for files that no longer exist.

## Troubleshooting

### The app opens, but I see no results

Most common reasons:

- you did not click `Scan data folder`
- your PDFs are not inside `data/`
- OCR tools are not installed

### Scan fails with missing command errors

You are probably missing one of these:

- `pdfinfo`
- `pdftoppm`
- `tesseract`

On macOS:

```bash
brew install uv node poppler tesseract
```

### A value looks wrong

OCR is never perfect. Open the proof drawer and check the original PDF page.

If the value is wrong, fix it in the `Review` tab.

### A date is missing

Put the PDF inside a dated folder like `data/2023-07-26/`.

The app can use the folder name as a fallback report date.
