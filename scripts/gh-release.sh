#!/usr/bin/env bash
# Publish a GitHub Release and upload the built Windows installers as assets.
# Uses the token already stored by git (no interactive login, token never printed).
set -euo pipefail

REPO="EvroHQ/EvroHQ-Downloader"
TAG="v1.0.0"
RELEASE_NAME="EvroHQ Downloader v1.0.0"
API="https://api.github.com"
UPLOAD="https://uploads.github.com"

SETUP_SRC="release/Audio Video YouTube Downloader-Setup-1.0.0.exe"
PORT_SRC="release/Audio Video YouTube Downloader-Portable-1.0.0.exe"
SETUP_NAME="AudioVideoYouTubeDownloader-Setup-1.0.0.exe"
PORT_NAME="AudioVideoYouTubeDownloader-Portable-1.0.0.exe"

TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null | sed -n 's/^password=//p')
if [ -z "$TOKEN" ]; then echo "ERROR: no GitHub token available"; exit 1; fi
AUTH="Authorization: token $TOKEN"

echo ">> Creating release $TAG ..."
create_resp=$(curl -s -X POST -H "$AUTH" -H "Accept: application/vnd.github+json" \
  "$API/repos/$REPO/releases" --data @scripts/release-payload.json)

release_id=$(printf '%s' "$create_resp" | sed -n 's/.*"id": *\([0-9]\+\).*/\1/p' | head -n1)

if [ -z "$release_id" ]; then
  # Maybe it already exists — fetch by tag.
  echo ">> Create failed or exists, fetching release by tag ..."
  get_resp=$(curl -s -H "$AUTH" -H "Accept: application/vnd.github+json" \
    "$API/repos/$REPO/releases/tags/$TAG")
  release_id=$(printf '%s' "$get_resp" | sed -n 's/.*"id": *\([0-9]\+\).*/\1/p' | head -n1)
fi

if [ -z "$release_id" ]; then
  echo "ERROR: could not create or find release."
  printf '%s\n' "$create_resp" | head -c 800
  exit 1
fi
echo ">> Release id: $release_id"

upload_asset() {
  local src="$1" name="$2"
  echo ">> Uploading $name ($(du -h "$src" | cut -f1)) ..."
  curl -s -X POST -H "$AUTH" -H "Content-Type: application/octet-stream" \
    --data-binary @"$src" \
    "$UPLOAD/repos/$REPO/releases/$release_id/assets?name=$name" \
    -o /tmp/asset_resp.json -w "   http=%{http_code}\n"
  # show the browser_download_url if present
  sed -n 's/.*"browser_download_url": *"\([^"]*\)".*/   url=\1/p' /tmp/asset_resp.json | head -n1 || true
}

upload_asset "$SETUP_SRC" "$SETUP_NAME"
upload_asset "$PORT_SRC" "$PORT_NAME"

echo ">> Done. Release page: https://github.com/$REPO/releases/tag/$TAG"
