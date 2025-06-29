[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md)

# What is Fantia downloader?

[Fantia](https://fantia.jp) is a platform for creators to share exclusive content such as photos and videos.  
This downloader allows you to download all media (images and videos) from posts, starting from a specified post ID and navigating forward or backward automatically.

> ⚠️ This tool is designed to be used only with the official Fantia web interface (GUI browser). It relies on Puppeteer to simulate browser behavior and should not be used with headless API-only access.

# Requirements
- [Node.js Environment](https://nodejs.org)
- [Yarn Package Manager](https://classic.yarnpkg.com/en/docs/install/) (or use `npm` instead)
- (optional) [Internet Download Manager (IDM)](https://www.internetdownloadmanager.com/) if using IDM for downloading

# Getting Started
1. Copy `.env.example` to `.env` and configure the required variables.
2. Run `yarn install` (or `npm install`) to install required packages.
3. Run `node .` to start the program.
4. The CLI will ask for the starting post ID — enter a valid Fantia post ID to begin downloading.

Post ID can be found in the URL:  
Example: `https://fantia.jp/posts/123456` → ID = `123456`

The script includes a cooldown between posts to prevent request throttling.

# Environment Variables

## DOWNLOAD_PATH
Where downloaded files will be saved. You can use either absolute or relative paths.  

## SESSION_ID
Used for legacy direct API access.  
Not required when using Puppeteer to log in interactively.

## BLOCK_KEYWORDS
Filter out posts whose titles contain any of these keywords.  
Multiple keywords should be separated by commas.  
Example:  
`BLOCK_KEYWORDS=test,draft,noaudio`

## BLOCK_FILENAME_KEYWORDS
Skip specific media files whose filenames contain any of these keywords.  
Multiple keywords should be separated by commas.  
Example:  
`BLOCK_FILENAME_KEYWORDS=English,twitter`

## DIRECTION
Specifies the direction in which to crawl posts:
- `forward` – Go to the next post (newer)
- `backward` – Go to the previous post (older)
- `once` – Download only the specified post and stop

## USE_IDM

If `true`, the downloader will call Internet Download Manager to handle downloads.  
IDM must be installed and `IDM_PATH` set correctly.  

## IDM_PATH

Full path to `IDMan.exe`.  

# Features

- Automated post navigation (`forward`, `backward`, or `once`)
- Progress bar with file size display
- Saves `post.json` for each downloaded post
- Skips files that already exist
- Keyword-based filtering for both post titles and individual filenames
- Supports login through interactive Puppeteer Chrome session (no need for manual cookie copy)
- Automatically continues to next/previous post after download

# Forbidden characters in filenames (on Windows)
The following characters are not allowed in filenames on Windows and are automatically replaced with `+`:

`/`, `\`, `?`, `%`, `*`, `:`, `|`, `"`, `<`, `>`

# License
MIT
