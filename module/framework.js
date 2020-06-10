/**
 * Import a single World Anvil article
 * @param {string} articleId            The World Anvil article ID to import
 * @param {JournalEntry|null} entry     An existing Journal Entry to sync
 * @return {Promise<JournalEntry>}
 */
export async function importArticle(articleId, entry=null) {
  const anvil = game.modules.get("world-anvil").anvil;
  const article = await anvil.getArticle(articleId);
  const folder = game.folders.find(f => f.getFlag("world-anvil", "categoryId") === article.category.id);
  const content = _getArticleContent(article);

  // Update an existing Journal Entry
  if ( entry ) {
    return entry.update({
      name: article.title,
      content: content.html,
      img: content.img
    });
  }

  // Create a new Journal Entry
  entry = await JournalEntry.create({
    name: article.title,
    content: content.html,
    img: content.img,
    folder: folder ? folder.id : null,
    "flags.world-anvil.articleId": article.id
  });
  ui.notifications.info(`Imported World Anvil article ${article.title}`);
  return entry;
}


/* -------------------------------------------- */


/**
 * Transform a World Anvil article HTML into a Journal Entry content and featured image.
 * @param {object} article
 * @return {{img: string, html: string}}
 * @private
 */
function _getArticleContent(article) {
  let content = `<h1>${article.title}</h1>\n<p>${article.content_parsed}</p><hr/>`;
  if ( article.sections ) {
    for ( let [s, c] of Object.entries(article.sections) ) {
      if ( s.endsWith("_parsed") ) {
        content += `<h2>${s.replace("_parsed", "").titleCase()}</h2>\n<p>${c}</p><hr/>`;
      }
    }
  }

  // HTML formatting
  const div = document.createElement("div");
  div.innerHTML = content;

  // Paragraph Breaks
  const t = document.createTextNode("%p%");
  div.querySelectorAll("span.line-spacer").forEach(s => s.parentElement.replaceChild(t.cloneNode(), s));

  // Images
  let image = null;
  div.querySelectorAll("img").forEach(i => {
    let img = new Image();
    img.src = `https://worldanvil.com${i.getAttribute("src")}`;
    img.alt = i.alt;
    img.title = i.title;
    i.parentElement.replaceChild(img, i);
    image = image || img;
  });

  // Regex formatting
  let html = div.innerHTML;
  html = html.replace(/%p%/g, "</p>\n<p>");

  // Return content and image
  return {
    html: html,
    img: image ? image.src : null
  }
}
