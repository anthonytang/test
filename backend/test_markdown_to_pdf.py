#!/usr/bin/env python3
"""
Test script to evaluate how markdown/web content looks when converted to PDF.

Usage:
    # Test with a URL (scrapes via Firecrawl with onlyMainContent)
    python test_markdown_to_pdf.py --url "https://example.com/article"

    # Test with a local markdown file
    python test_markdown_to_pdf.py --file "path/to/file.md"

    # Test with raw markdown string
    python test_markdown_to_pdf.py --text "# Hello World\n\nThis is a test."

    # Use different styles
    python test_markdown_to_pdf.py --file README.md --style github
    python test_markdown_to_pdf.py --file README.md --style pandoc

    # Include navigation/footer (disable onlyMainContent)
    python test_markdown_to_pdf.py --url "https://example.com" --full-page

Requirements:
    pip install mistune httpx firecrawl-py python-dotenv

    Gotenberg must be running (default: http://localhost:3001)
"""

import argparse
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from datetime import datetime

import httpx
import mistune
from dotenv import load_dotenv

load_dotenv()

GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://localhost:3001")

# =============================================================================
# CSS STYLES - Industry Standards
# =============================================================================

# GitHub Markdown CSS (from sindresorhus/github-markdown-css)
# https://github.com/sindresorhus/github-markdown-css
GITHUB_STYLES = """
<style>
.markdown-body {
  -ms-text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
  margin: 0;
  color: #1f2328;
  background-color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  word-wrap: break-word;
  box-sizing: border-box;
  min-width: 200px;
  max-width: 980px;
  margin: 0 auto;
  padding: 45px;
}

@media (max-width: 767px) {
  .markdown-body { padding: 15px; }
}

.markdown-body a { color: #0969da; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }

.markdown-body b, .markdown-body strong { font-weight: 600; }

.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-body h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid #d1d9e0; }
.markdown-body h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid #d1d9e0; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }
.markdown-body h5 { font-size: .875em; }
.markdown-body h6 { font-size: .85em; color: #59636e; }

.markdown-body p { margin-top: 0; margin-bottom: 16px; }

.markdown-body blockquote {
  margin: 0;
  padding: 0 1em;
  color: #59636e;
  border-left: .25em solid #d1d9e0;
}

.markdown-body ul, .markdown-body ol {
  margin-top: 0;
  margin-bottom: 16px;
  padding-left: 2em;
}

.markdown-body li { margin-top: .25em; }
.markdown-body li + li { margin-top: .25em; }

.markdown-body code {
  padding: .2em .4em;
  margin: 0;
  font-size: 85%;
  white-space: break-spaces;
  background-color: rgba(175, 184, 193, 0.2);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

.markdown-body pre {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  color: #1f2328;
  background-color: #f6f8fa;
  border-radius: 6px;
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body pre code {
  padding: 0;
  margin: 0;
  font-size: 100%;
  background-color: transparent;
  border: 0;
}

.markdown-body table {
  border-spacing: 0;
  border-collapse: collapse;
  margin-top: 0;
  margin-bottom: 16px;
  display: block;
  width: max-content;
  max-width: 100%;
  overflow: auto;
}

.markdown-body table th, .markdown-body table td {
  padding: 6px 13px;
  border: 1px solid #d1d9e0;
}

.markdown-body table th {
  font-weight: 600;
  background-color: #f6f8fa;
}

.markdown-body table tr { background-color: #ffffff; }
.markdown-body table tr:nth-child(2n) { background-color: #f6f8fa; }

.markdown-body hr {
  height: .25em;
  padding: 0;
  margin: 24px 0;
  background-color: #d1d9e0;
  border: 0;
}

.markdown-body img { max-width: 100%; box-sizing: content-box; }

.markdown-body mark { background-color: #fff8c5; color: #1f2328; }

.source-url {
  font-size: 12px;
  color: #59636e;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #d1d9e0;
}

.metadata {
  font-size: 12px;
  color: #59636e;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #d1d9e0;
}
</style>
"""

# Pandoc-style CSS (from gist.github.com/killercup/5917178)
# Clean, academic styling
PANDOC_STYLES = """
<style>
body {
  font-family: Georgia, Palatino, 'Palatino Linotype', Times, 'Times New Roman', serif;
  font-size: 12px;
  line-height: 1.7;
  color: #1a1a1a;
  max-width: 42em;
  margin: 0 auto;
  padding: 40px;
  background: #fefefe;
}

@media (min-width: 480px) { body { font-size: 14px; } }
@media (min-width: 768px) { body { font-size: 16px; } }

a { color: #0645ad; text-decoration: none; }
a:hover { text-decoration: underline; }
a:visited { color: #0b0080; }

h1, h2, h3, h4, h5, h6 {
  font-weight: normal;
  color: #111;
  line-height: 1.2;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

h1 { font-size: 2.5em; border-bottom: 2px solid #ddd; padding-bottom: 0.2em; }
h2 { font-size: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
h3 { font-size: 1.5em; }
h4 { font-size: 1.2em; font-weight: bold; }
h5 { font-size: 1em; font-weight: bold; }
h6 { font-size: 0.9em; font-weight: bold; color: #777; }

p { margin: 1em 0; }

blockquote {
  margin: 1em 0;
  padding-left: 1.5em;
  border-left: 4px solid #ddd;
  color: #666;
  font-style: italic;
}

ul, ol { margin: 1em 0; padding-left: 2em; }
li { margin: 0.5em 0; }

code {
  font-family: Consolas, Monaco, 'Andale Mono', monospace;
  font-size: 0.9em;
  background: #f4f4f4;
  padding: 0.2em 0.4em;
  border-radius: 3px;
}

pre {
  background: #f4f4f4;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1em;
  overflow-x: auto;
  line-height: 1.4;
}

pre code {
  background: none;
  padding: 0;
  font-size: 0.85em;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.5em 1em;
  text-align: left;
}

th { background: #f4f4f4; font-weight: bold; }
tr:nth-child(even) { background: #fafafa; }

hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 2em 0;
}

img { max-width: 100%; }

.source-url {
  font-size: 0.8em;
  color: #666;
  margin-bottom: 1em;
  padding-bottom: 0.5em;
  border-bottom: 1px solid #ddd;
}

.metadata {
  font-size: 0.8em;
  color: #666;
  margin-top: 2em;
  padding-top: 1em;
  border-top: 1px solid #ddd;
}
</style>
"""

STYLES = {
    "github": GITHUB_STYLES,
    "pandoc": PANDOC_STYLES,
}

# Template for GitHub style (uses .markdown-body wrapper)
GITHUB_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    {styles}
</head>
<body>
<article class="markdown-body">
    {source_header}
    {content}
    {metadata_footer}
</article>
</body>
</html>
"""

# Template for other styles (no wrapper needed)
SIMPLE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    {styles}
</head>
<body>
    {source_header}
    {content}
    {metadata_footer}
</body>
</html>
"""


def markdown_to_html(markdown_text: str) -> str:
    """Convert markdown to HTML using mistune."""
    md = mistune.create_markdown(
        plugins=['strikethrough', 'table', 'url']
    )
    return md(markdown_text)


def create_html_document(
    content_html: str,
    title: str = "Document",
    source_url: str = None,
    include_metadata: bool = True,
    style: str = "github"
) -> str:
    """Wrap HTML content in a full document with styling."""
    source_header = ""
    if source_url:
        source_header = f'<div class="source-url">Source: <a href="{source_url}">{source_url}</a></div>'

    metadata_footer = ""
    if include_metadata:
        metadata_footer = f'<div class="metadata">Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</div>'

    template = GITHUB_TEMPLATE if style == "github" else SIMPLE_TEMPLATE
    styles = STYLES.get(style, GITHUB_STYLES)

    return template.format(
        title=title,
        styles=styles,
        source_header=source_header,
        content=content_html,
        metadata_footer=metadata_footer
    )


async def convert_html_to_pdf(html_content: str, output_path: str) -> bool:
    """Convert HTML to PDF using Gotenberg Chromium endpoint."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(html_content)
        html_path = f.name

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            with open(html_path, 'rb') as f:
                response = await client.post(
                    f"{GOTENBERG_URL}/forms/chromium/convert/html",
                    files={"files": ("index.html", f, "text/html")},
                    data={
                        "marginTop": "0.5",
                        "marginBottom": "0.5",
                        "marginLeft": "0.5",
                        "marginRight": "0.5",
                        "printBackground": "true",
                    }
                )

            if response.status_code == 200:
                with open(output_path, 'wb') as out:
                    out.write(response.content)
                return True
            else:
                print(f"Error from Gotenberg: {response.status_code}")
                print(response.text[:500] if response.text else "No error message")
                return False

    except httpx.ConnectError:
        print(f"ERROR: Could not connect to Gotenberg at {GOTENBERG_URL}")
        print("Make sure Gotenberg is running: docker run -p 3001:3000 gotenberg/gotenberg:8")
        return False
    finally:
        os.unlink(html_path)


async def scrape_url(url: str, use_html: bool = False, only_main_content: bool = True) -> dict:
    """Scrape URL using Firecrawl.

    Firecrawl options:
    - formats: ["markdown", "html", "rawHtml", "links", "screenshot"]
    - onlyMainContent: removes nav, header, footer (default: True)
    - includeTags: only include specific tags/classes
    - excludeTags: exclude specific tags/classes
    """
    try:
        from firecrawl import Firecrawl

        api_key = os.getenv("FIRECRAWL_API_KEY")
        if not api_key:
            print("ERROR: FIRECRAWL_API_KEY not set in environment")
            sys.exit(1)

        firecrawl = Firecrawl(api_key=api_key)

        formats = ["html", "markdown"] if use_html else ["markdown"]

        print(f"Scraping {url}")
        print(f"  formats: {formats}")
        print(f"  onlyMainContent: {only_main_content}")

        # Firecrawl scrape with options
        result = firecrawl.scrape(
            url,
            formats=formats,
            only_main_content=only_main_content,
        )

        return {
            "markdown": result.markdown if hasattr(result, 'markdown') else None,
            "html": result.html if hasattr(result, 'html') else None,
            "title": result.metadata.title if result.metadata else url,
            "description": result.metadata.description if result.metadata else None,
        }
    except ImportError:
        print("ERROR: firecrawl-py not installed. Run: pip install firecrawl-py")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR scraping URL: {e}")
        sys.exit(1)


async def main():
    parser = argparse.ArgumentParser(
        description="Test markdown/web content to PDF conversion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Styles:
    github  - GitHub markdown rendering (default, industry standard)
    pandoc  - Academic/document style (serif fonts)

Examples:
    python test_markdown_to_pdf.py --url "https://example.com/article"
    python test_markdown_to_pdf.py --url "https://example.com" --full-page
    python test_markdown_to_pdf.py --file "./README.md" --style pandoc
    python test_markdown_to_pdf.py --url "https://example.com" --use-html
        """
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="URL to scrape and convert")
    group.add_argument("--file", help="Path to markdown file")
    group.add_argument("--text", help="Raw markdown text")

    parser.add_argument("--style", choices=["github", "pandoc"], default="github",
                        help="CSS style to use (default: github)")
    parser.add_argument("--use-html", action="store_true",
                        help="Use HTML from Firecrawl instead of markdown")
    parser.add_argument("--full-page", action="store_true",
                        help="Include navigation/footer (disable onlyMainContent)")
    parser.add_argument("--output", "-o", help="Output PDF path")
    parser.add_argument("--save-html", action="store_true",
                        help="Also save the intermediate HTML")

    args = parser.parse_args()

    # Generate output path
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = args.output or f"output_{args.style}_{timestamp}.pdf"

    title = "Document"
    source_url = None
    content_html = None

    if args.url:
        source_url = args.url
        scraped = await scrape_url(
            args.url,
            use_html=args.use_html,
            only_main_content=not args.full_page
        )
        title = scraped["title"] or args.url

        if args.use_html and scraped["html"]:
            print("Using HTML from Firecrawl...")
            content_html = scraped["html"]
        elif scraped["markdown"]:
            print("Converting markdown to HTML...")
            content_html = markdown_to_html(scraped["markdown"])
        else:
            print("ERROR: No content received from Firecrawl")
            sys.exit(1)

    elif args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"ERROR: File not found: {args.file}")
            sys.exit(1)

        title = file_path.stem
        markdown_content = file_path.read_text(encoding='utf-8')
        content_html = markdown_to_html(markdown_content)
        print(f"Loaded {len(markdown_content)} chars from {args.file}")

    elif args.text:
        markdown_content = args.text.replace("\\n", "\n")
        content_html = markdown_to_html(markdown_content)
        title = "Test Document"

    # Create full HTML document
    full_html = create_html_document(
        content_html=content_html,
        title=title,
        source_url=source_url,
        style=args.style
    )

    # Optionally save HTML
    if args.save_html:
        html_path = output_path.replace('.pdf', '.html')
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(full_html)
        print(f"Saved HTML: {html_path}")

    # Convert to PDF
    print(f"Converting to PDF via Gotenberg ({GOTENBERG_URL})...")
    print(f"Using style: {args.style}")
    success = await convert_html_to_pdf(full_html, output_path)

    if success:
        file_size = os.path.getsize(output_path)
        print(f"\nSUCCESS: {output_path} ({file_size:,} bytes)")
        print(f"\nOpen with: open {output_path}")
    else:
        print("\nFAILED: Could not generate PDF")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
