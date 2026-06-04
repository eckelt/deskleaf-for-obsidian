cd "/Users/nils/Library/Mobile Documents/com~apple~CloudDocs/Projekte/Repositories/deskleaf-for-obsidian" && \
npm run build 2>&1 && \
npm test 2>&1 | tail -5 && \
DEST="/Users/nils/Library/Mobile Documents/iCloud~md~obsidian/Documents/Verknüpfungen/.obsidian/plugins/deskleaf-for-obsidian" && \
cp main.js "$DEST/main.js" && \
cp styles.css "$DEST/styles.css" && \
echo "deployed"
