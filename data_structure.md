# Quiz Data Structure

The quiz reads all of its content from one JSON file (`mock.json` by default). Copy that file, replace the content with your own questions, and keep the structure the same.

## Overview

```json
{
  "title": "Quiz title",
  "scoring": { "correct": 2, "wrong": -1, "blank": 0 },
  "parts": [
    {
      "title": "Chapter name",
      "questions": [
        {
          "question": "Question text",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "answer": 1,
          "explanation": "Why the answer is correct"
        }
      ]
    }
  ]
}
```

## Fields

### Top level

| Field | Required | Description |
|---|---|---|
| `title` | No | Shown at the top of the quiz and as the page title. |
| `scoring` | No | Points per result. Defaults to `correct: 2`, `wrong: -1`, `blank: 0`. You can omit it or change any value. |
| `parts` | Yes | List of parts (chapters). Shown in the order written. |

### Part (each item in `parts`)

| Field | Required | Description |
|---|---|---|
| `title` | Recommended | Part name, shown above each question and in the score list. |
| `questions` | Yes | List of questions in this part. Must have at least one. |

### Question (each item in `questions`)

| Field | Required | Description |
|---|---|---|
| `question` | Yes | The question text. |
| `options` | Yes | List of answer choices as plain strings. 2 to 10 options. Letters (A, B, C...) are added automatically by position. |
| `answer` | Yes | The **index** of the correct option, **starting from 0**. `0` = first option (A), `1` = second (B), `2` = third (C), and so on. |
| `explanation` | No | Shown below the options on the results page. |

## Important rules

- `answer` counts from **0**, not 1. With 4 options, valid values are `0`, `1`, `2`, `3`.
- Do not write letters inside `options`. Write `"Newton"`, not `"B. Newton"`.
- Questions are shown one at a time in the order of the file, part by part. Question numbers run continuously across parts.
- Text is displayed as plain text, so HTML tags will appear literally.
- To include a double quote inside text, escape it: `"He said \"hello\""`.
- No trailing commas, and use double quotes for all keys and strings, or the file will not load.

## Scoring

- Correct answer: `scoring.correct` points (default +2)
- Wrong answer: `scoring.wrong` points (default -1)
- Blank (unanswered): `scoring.blank` points (default 0)
- Maximum score = number of questions x `scoring.correct`.
- Each part shows its own score as `part score/part maximum`. A part score can be negative.