# Qasid
Qasid is an all-in-one Indian IPO allotment checker. It supports bulk PAN checking across KFintech, MUFG (Link Intime), and Bigshare Services, featuring a built-in OCR engine to automatically bypass Bigshare's image captchas.

# Qasid 🚀

**Qasid** is a powerful, all-in-one Node.js application designed to check Indian IPO allotment statuses seamlessly. Instead of visiting multiple registrar websites and solving captchas manually, Qasid aggregates data from **KFintech, MUFG (Link Intime), and Bigshare Services** into a single, unified interface.

The standout feature of Qasid is its **built-in Auto-Captcha Solver**. It uses local OCR (Tesseract.js + Jimp) to bypass Bigshare's aggressive image captcha protection in the background, allowing for true bulk-checking without requiring paid third-party API keys.

## ✨ Features

* **Universal Registrar Support:** Fetches live IPO lists and allotment statuses from KFintech, MUFG, and all 3 of Bigshare's server nodes.
* **Bulk PAN Checking:** Check up to 50 PAN numbers at once for any selected IPO.
* **Auto-Captcha Solving (OCR):** Automatically pre-processes, cleans, and solves Bigshare's image captchas locally using Tesseract.js. Features auto-retry logic for misread characters.
* **Smart Session Management:** Automatically handles CSRF tokens and ASP.NET session cookies for MUFG.
* **Clean User Interface:** A responsive, modern frontend that displays allotment results beautifully—no raw JSON for the end user.

## 🛠️ Tech Stack

* **Backend:** Node.js, Express.js
* **HTTP Client:** Axios
* **Image Processing (OCR):** Jimp (v0.22.10), Tesseract.js
* **Frontend:** Vanilla HTML, CSS, JavaScript

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/yourusername/Qasid.git](https://github.com/yourusername/Qasid.git)
   cd Qasid
