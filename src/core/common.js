/********************************************************************
 *
 * Shared functions for most scripts, including background scripts and
 * content scripts.
 *
 * @public {Object} scrapbook
 *******************************************************************/

var scrapbook = {};
var isDebug = false;


/********************************************************************
 * Options
 *******************************************************************/

scrapbook.options = {
  "capture.dataFolder": "WebScrapBook",
  "capture.saveAs": "zip", // "downloads", "zip", "maff", "singleHtml"
  "capture.savePrompt": false,
  "capture.saveAsciiFilename": false,
  "capture.saveSelectionOnly": true,
  "capture.saveFileAsHtml": false,
  "capture.saveDataUriAsFile": false,
  "capture.favicon": "save", // "save", "link", "blank", "remove"
  "capture.image": "save", // "save", "link", "blank", "remove"
  "capture.imageBackground": "save", // "save", "link", "remove"
  "capture.audio": "save", // "save", "link", "blank", "remove"
  "capture.video": "save", // "save", "link", "blank", "remove"
  "capture.embed": "save", // "save", "link", "blank", "remove"
  "capture.object": "save", // "save", "link", "blank", "remove"
  "capture.applet": "save", // "save", "link", "blank", "remove"
  "capture.canvas": "save", // "save", "blank", "remove"
  "capture.frame": "save", // "save", "link", "blank", "remove"
  "capture.font": "save", // "save", "link", "blank", "remove"
  "capture.style": "save", // "save", "link", "blank", "remove"
  "capture.styleInline": "save", // "save", "blank", "remove"
  "capture.rewriteCss": "url", // "none", "url"
  "capture.script": "blank", // "save", "link", "blank", "remove"
  "capture.scriptAnchor": "blank", // "save", "blank", "remove"
  "capture.scriptAttr": "remove", // "save", "remove"
  "capture.noscript": "save", // "save", "blank", "remove"
  "capture.base": "blank", // "save", "blank", "remove"
  "capture.metaRefresh": "save", // "save", "link", "blank", "remove"
  "capture.removeIntegrity": true,
  "capture.recordDocumentMeta": true,
  "capture.recordRemovedNode": false,
  "capture.recordRewrittenAttr": false,
  "capture.recordSourceUri": false,
  "capture.recordErrorUri": false,
  "viewer.useFileSystemApi": true,
  "viewer.viewHtz": true,
  "viewer.viewMaff": true,
};

scrapbook.isOptionsSynced = false;

scrapbook.getOption = function (key, defaultValue) {
  var result = scrapbook.options[key];
  if (result === undefined) {
    result = defaultValue;
  }
  return result;
};

scrapbook.getOptions = function (keyPrefix) {
  var result = {};
  var regex = new RegExp("^" + scrapbook.escapeRegExp(keyPrefix) + ".");
  for (let key in scrapbook.options) {
    if (regex.test(key)) {
      result[key] = scrapbook.getOption(key);
    }
  }
  return result;
};

scrapbook.setOption = function (key, value, callback) {
  scrapbook.options[key] = value;
  chrome.storage.sync.set({key: value}, () => {
    if (callback) {
      callback({key: value});
    }
  });
};

scrapbook.loadOptions = function (callback) {
  chrome.storage.sync.get(scrapbook.options, (items) => {
    for (let i in items) {
      scrapbook.options[i] = items[i];
    }
    scrapbook.isOptionsSynced = true;
    if (callback) {
      callback(items);
    }
  });
};

scrapbook.saveOptions = function (callback) {
  chrome.storage.sync.set(scrapbook.options, () => {
    if (callback) {
      callback(scrapbook.options);
    }
  });
};


/********************************************************************
 * Lang
 *******************************************************************/

scrapbook.lang = function (key, args) {
  return chrome.i18n.getMessage(key, args) || "__MSG_" + key + "__";
};

scrapbook.loadLanguages = function (rootNode) {
  Array.prototype.forEach.call(rootNode.getElementsByTagName("*"), (elem) => {
    if (elem.childNodes.length === 1) {
      let child = elem.firstChild;
      if (child.nodeType === 3) {
        child.nodeValue = child.nodeValue.replace(/__MSG_(.*?)__/, (m, k) => scrapbook.lang(k));
      }
    }
    Array.prototype.forEach.call(elem.attributes, (attr) => {
      attr.nodeValue = attr.nodeValue.replace(/__MSG_(.*?)__/, (m, k) => scrapbook.lang(k));
    }, this);
  }, this);
};


/********************************************************************
 * ScrapBook related path/file/string/etc handling
 *******************************************************************/

/**
 * Escapes the given filename string to be used in the URI
 *
 * Preserves other chars for beauty
 *
 * see also: validateFilename
 */
scrapbook.escapeFilename = function (filename) {
  return filename.replace(/[ %#]+/g, m => encodeURIComponent(m));
};

/**
 * Transliterates the given string to be a safe filename
 *
 * see also: escapeFileName
 *
 * @param {string} filename
 * @param {boolean} forceAscii - also escapes all non-ASCII chars
 */
scrapbook.validateFilename = function (filename, forceAscii) {
  var fn = filename
      // control chars are bad for filename
      .replace(/[\x00-\x1F\x7F]+|^ +/g, "")
      // leading/trailing spaces and dots are not allowed in Windows
      .replace(/^\./, "_.").replace(/^ +/, "").replace(/[. ]+$/, "")
      // bad chars in most OS
      .replace(/[:"?*\\/|]/g, "_")
      // "~" is not allowed by Chromium downloader
      .replace(/[~]/g, "-").replace(/[<]/g, "(").replace(/[>]/g, ")");
  if (forceAscii) {
    fn = fn.replace(/[^\x00-\x7F]+/g, m => encodeURIComponent(m));
  }
  fn = fn || "_"; // prevent empty filename
  return fn;
};

scrapbook.urlToFilename = function (url) {
  var name = url, pos;
  pos = name.indexOf("?");
  if (pos !== -1) { name = name.substring(0, pos); }
  pos = name.indexOf("#");
  if (pos !== -1) { name = name.substring(0, pos); }
  pos = name.lastIndexOf("/");
  if (pos !== -1) { name = name.substring(pos + 1); }

  // decode %xx%xx%xx only if it's correctly UTF-8 encoded
  // @TODO: decode using a specified charset
  try {
    name = decodeURIComponent(name);
  } catch (ex) {}
  return name;
};

scrapbook.splitUrl = function (url) {
  var name = url, search = "", hash = "", pos;
  pos = name.indexOf("#");
  if (pos !== -1) { hash = name.slice(pos); name = name.slice(0, pos); }
  pos = name.indexOf("?");
  if (pos !== -1) { search = name.slice(pos); name = name.slice(0, pos); }
  return [name, search, hash];
};

scrapbook.splitUrlByAnchor = function (url) {
  var [name, search, hash] = scrapbook.splitUrl(url);
  return [name + search, hash];
};

scrapbook.filenameParts = function (filename) {
  var pos = filename.lastIndexOf(".");
  if (pos != -1) {
    return [filename.substring(0, pos), filename.substring(pos + 1, filename.length)];
  }
  return [filename, ""];
};

/**
 * Returns the ScrapBook ID from a given Date object
 *
 * @param  {Date|undefined} date - Given day, or now if undefined
 * @return {string} the ScrapBook ID
 */
scrapbook.dateToId = function (date) {
  var dd = date || new Date();
  return dd.getUTCFullYear() +
      this.intToFixedStr(dd.getUTCMonth() + 1, 2) +
      this.intToFixedStr(dd.getUTCDate(), 2) +
      this.intToFixedStr(dd.getUTCHours(), 2) +
      this.intToFixedStr(dd.getUTCMinutes(), 2) +
      this.intToFixedStr(dd.getUTCSeconds(), 2) +
      this.intToFixedStr(dd.getUTCMilliseconds(), 3);
};

/**
 * @param {Date} id - Given ScrapBook ID
 */
scrapbook.idToDate = function (id) {
  var dd;
  if (id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/)) {
    dd = new Date(
        parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10),
        parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10), parseInt(RegExp.$7, 10)
        );
    dd.setTime(dd.valueOf() - dd.getTimezoneOffset() * 60 * 1000);
  }
  return dd;
};

/**
 * Returns the ScrapBook ID from a given Date object
 *
 * @deprecated Used by older ScrapBook 1.x, may get inaccurate if used across different timezone
 * @param {Date|undefined} date - Given day, or now if undefined
 * @return {string} the ScrapBook ID
 */
scrapbook.dateToIdOld = function (date) {
  var dd = date || new Date();
  return dd.getFullYear() +
      this.intToFixedStr(dd.getMonth() + 1, 2) +
      this.intToFixedStr(dd.getDate(), 2) +
      this.intToFixedStr(dd.getHours(), 2) +
      this.intToFixedStr(dd.getMinutes(), 2) +
      this.intToFixedStr(dd.getSeconds(), 2);
};

/**
 * @deprecated Used by older ScrapBook 1.x, may get inaccurate if used across different timezone
 * @param {Date} id - Given ScrapBook ID
 */
scrapbook.idToDateOld = function (id) {
  var dd;
  if (id.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)) {
    dd = new Date(
        parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10),
        parseInt(RegExp.$4, 10), parseInt(RegExp.$5, 10), parseInt(RegExp.$6, 10)
        );
  }
  return dd;
};


/********************************************************************
 * String handling
 *******************************************************************/

/**
 * Crops the given string
 *
 * @param {boolean} byUtf8   - true to crop texts according to each byte under UTF-8 encoding
 *                             false to crop according to each UTF-16 char
 * @param {boolean} ellipsis - string for ellipsis
 */
scrapbook.crop = function (str, maxLength, byUtf8, ellipsis) {
  if (typeof ellipsis  === "undefined") { ellipsis = "..."; }
  if (byUtf8) {
    var bytes = this.unicodeToUtf8(str);
    if (bytes.length <= maxLength) { return str; }
    bytes = bytes.substring(0, maxLength - this.unicodeToUtf8(ellipsis).length);
    while (true) {
      try {
        return this.utf8ToUnicode(bytes) + ellipsis;
      } catch (ex) {}
      bytes= bytes.substring(0, bytes.length-1);
    }
  } else {
    return (str.length > maxLength) ? str.substr(0, maxLength - ellipsis.length) + ellipsis : str;
  }
};

scrapbook.getUuid = function () {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    var r = Math.random()*16|0, v = (c == 'x') ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

scrapbook.escapeHtml = function (str, noDoubleQuotes, singleQuotes, spaces) {
  var list = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': (noDoubleQuotes ? '"' : "&quot;"),
    "'": (singleQuotes ? "&#39;" : "'"),
    " ": (spaces ? "&nbsp;" : " ")
  };
  return str.replace(/[&<>"']| (?= )/g, m => list[m]);
};

scrapbook.escapeRegExp = function (str) {
  return str.replace(/([\*\+\?\.\^\/\$\\\|\[\]\{\}\(\)])/g, "\\$1");
};

scrapbook.escapeHtmlComment = function (str) {
  return str.replace(/-([\u200B]*)-/g, "-\u200B$1-");
};

scrapbook.escapeQuotes = function (str) {
  return str.replace(/[\\"]/g, "\\$&");
};

scrapbook.unescapeQuotes = function (str) {
  return str.replace(/\\(.)/g, "$1");
};

scrapbook.unescapeCss = function (str) {
  var that = arguments.callee;
  if (!that.replaceRegex) {
    that.replaceRegex = /\\([0-9A-Fa-f]{1,6}) ?|\\(.)/g;
    that.getCodes = function (n) {
      if (n < 0x10000) return [n];
      n -= 0x10000;
      return [0xD800+(n>>10), 0xDC00+(n&0x3FF)];
    };
    that.replaceFunc = function (m, u, c) {
      if (c) return c;
      if (u) return String.fromCharCode.apply(null, that.getCodes(parseInt(u, 16)));
    };
  }
  return str.replace(that.replaceRegex, that.replaceFunc);
};

scrapbook.decodeURIComponent = function (uri) {
  // A URL containing standalone "%"s causes a malformed URI sequence error.
  return uri.replace(/(%[0-9A-F]{2})+/gi, m => decodeURIComponent(m));
};

scrapbook.stringToDataUri = function (str, mime, charset) {
  mime = mime || "";
  charset = charset ? ";charset=" + charset : "";
  return "data:" + mime + charset + ";base64," + this.unicodeToBase64(str);
};

scrapbook.dataUriToFile = function (dataUri) {
  if (dataUri.startsWith("data:")) {
    dataUri = dataUri.slice(5);

    if (/^(.*?),(.*?)$/.test(dataUri)) {
      var metas = RegExp.$1.split(";");
      var data = RegExp.$2;
      var mime = metas.shift();
      var base64 = false;
      var parameters = {};

      metas.forEach((meta) => {
        if (/^(.*?)=(.*?)$/.test(meta)) {
          parameters[RegExp.$1.toLowerCase()] = RegExp.$2;
        } else if (meta == "base64") {
          base64 = true;
        }
      }, this);

      var ext = Mime.prototype.extension(mime);
      ext = ext ? ("." + ext) : "";

      if (base64) {
        var bstr = atob(data);
        var filename = scrapbook.sha1(bstr, "BYTES") + ext;
        var file = new File([bstr], filename, {type: mime});
      } else {
        var charset = (parameters.charset || "US-ASCII").toLowerCase();
        switch (charset) {
          case "us-ascii":
            var str = unescape(data);
            var filename = scrapbook.sha1(str, "BYTES") + ext;
            var file = new File([str], filename, {type: mime});
            break;
          case "utf-8":
            var str = decodeURIComponent(data);
            var filename = scrapbook.sha1(str, "TEXT") + ext;
            var file = new File([str], filename, {type: mime});
            break;
          default:
            console.error('Unsupported charset in data URI: ' + charset);
            file = null;
            break;
        }
      }
      return file;
    }
  }
  return null;
};

scrapbook.unicodeToUtf8 = function (chars) {
  return unescape(encodeURIComponent(chars));
};

scrapbook.utf8ToUnicode = function (bytes) {
  return decodeURIComponent(escape(bytes));
};

scrapbook.unicodeToBase64 = function (str) {
  return btoa(unescape(encodeURIComponent(str)));
};

scrapbook.base64ToUnicode = function (str) {
  return decodeURIComponent(escape(atob(str)));
};

/**
 * supported data types: HEX, TEXT, B64, BYTES, or ARRAYBUFFER
 *
 * @require jsSHA
 */
scrapbook.sha1 = function (data, type) {
  var shaObj = new jsSHA("SHA-1", type);
  shaObj.update(data);
  return shaObj.getHash("HEX");
};

scrapbook.intToFixedStr = function (number, width, padder) {
  padder = padder || "0";
  number = number.toString(10);
  return number.length >= width ? number : new Array(width - number.length + 1).join(padder) + number;
};

scrapbook.byteStringToArrayBuffer = function (bstr) {
  return (new Uint8Array(Array.prototype.map.call(bstr, x => x.charCodeAt(0)))).buffer;
};

scrapbook.arrayBufferToByteString = function (ab) {
  var bufferView = new Uint8Array(ab), result = "", CHUNK_SIZE = 65535;
  for (let i = 0, length = bufferView.length; i < length; i += CHUNK_SIZE) {
    result += String.fromCharCode.apply(null, bufferView.subarray(i, i + CHUNK_SIZE));
  }
  return result;
};


/********************************************************************
 * String handling - HTML Header parsing
 *******************************************************************/

/**
 * Parse Content-Type string from the HTTP Header
 *
 * @return {{contentType: string, charset: string}}
 */
scrapbook.parseHeaderContentType = function (string) {
  var result = {type: undefined, parameters: {}};

  if (typeof string !== 'string') {
    return result;
  }

  if (/^(.*?)(?=;|$)/i.test(string)) {
    string = RegExp.rightContext;
    result.type = RegExp.$1.trim();
    while (/;((?:"(?:\\.|[^"])*(?:"|$)|[^"])*?)(?=;|$)/i.test(string)) {
      string = RegExp.rightContext;
      var parameter = RegExp.$1;
      if (/\s*(.*?)\s*=\s*("(?:\\.|[^"])*"|[^"]*?)\s*$/i.test(parameter)) {
        var field = RegExp.$1;
        var value = RegExp.$2;

        // manage double quoted value
        if (/^"(.*?)"$/.test(value)) {
          value = scrapbook.unescapeQuotes(RegExp.$1);
        }
      }
      result.parameters[field] = value;
    }
  }

  return result;
};

/**
 * Parse Content-Disposition string from the HTTP Header
 *
 * ref: https://github.com/jshttp/content-disposition/blob/master/index.js
 *
 * @param {string} string - The string to parse, not including "Content-Disposition: "
 * @return {{type: ('inline'|'attachment'), parameters: {[filename: string]}}}
 */
scrapbook.parseHeaderContentDisposition = function (string) {
  var result = {type: undefined, parameters: {}};

  if (typeof string !== 'string') {
    return result;
  }

  if (/^(.*?)(?=;|$)/i.test(string)) {
    string = RegExp.rightContext;
    result.type = RegExp.$1.trim();
    while (/;((?:"(?:\\.|[^"])*(?:"|$)|[^"])*?)(?=;|$)/i.test(string)) {
      string = RegExp.rightContext;
      var parameter = RegExp.$1;
      if (/\s*(.*?)\s*=\s*("(?:\\.|[^"])*"|[^"]*?)\s*$/i.test(parameter)) {
        var field = RegExp.$1;
        var value = RegExp.$2;

        // manage double quoted value
        if (/^"(.*?)"$/.test(value)) {
          value = scrapbook.unescapeQuotes(RegExp.$1);
        }

        if (/^(.*)\*$/.test(field)) {
          // the field uses an ext-value
          field = RegExp.$1;
          if (/^(.*?)'(.*?)'(.*?)$/.test(value)) {
            var charset = RegExp.$1.toLowerCase(), lang = RegExp.$2.toLowerCase(), value = RegExp.$3;
            switch (charset) {
              case 'iso-8859-1':
                value = decodeURIComponent(value).replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
                break;
              case 'utf-8':
                value = decodeURIComponent(value);
                break;
              default:
                console.error('Unsupported charset in the extended field of header content-disposition: ' + charset);
                break;
            }
          }
        }
      }
      result.parameters[field] = value;
    }
  }

  return result;
};

/**
 * Parse Refresh string from the HTTP Header
 *
 * ref: https://www.w3.org/TR/html5/document-metadata.html
 *
 * @return {{time: string, url: string}}
 */
scrapbook.parseHeaderRefresh = function (string) {
  var result = {time: undefined, url: undefined};

  if (typeof string !== 'string') {
    return result;
  }

  if (/^\s*(.*?)(?=[;,]|$)/i.test(string)) {
    result.time = parseInt(RegExp.$1);
    string = RegExp.rightContext;
    if (/^[;,]\s*url\s*=\s*((["'])?.*)$/i.test(string)) {
      var url = RegExp.$1;
      var quote = RegExp.$2;
      if (quote) {
        let pos = url.indexOf(quote, 1);
        if (pos !== -1) { url = url.slice(1, pos); }
      }
      url = url.trim().replace(/[\t\n\r]+/g, "");
      result.url = url;
    }
  }

  return result;
};

/********************************************************************
 * HTML DOM related utilities
 *******************************************************************/

scrapbook.doctypeToString = function (doctype) {
  if (!doctype) { return ""; }
  var ret = "<!DOCTYPE " + doctype.name;
  if (doctype.publicId) { ret += ' PUBLIC "' + doctype.publicId + '"'; }
  if (doctype.systemId) { ret += ' "'        + doctype.systemId + '"'; }
  ret += ">\n";
  return ret;
};

/**
 * The function that is called to process the rewritten CSS.
 *
 * @callback parseCssFileRewriteFuncCallback
 * @param {string} cssText - the rewritten CSS text
 */

/**
 * The function that rewrites the CSS text.
 *
 * @callback parseCssFileRewriteFunc
 * @param {string} oldText - the original CSS text
 * @param {parseCssFileRewriteFuncCallback} onRewriteComplete
 */

/**
 * @callback parseCssFileCallback
 * @param {Blob} cssBlob - the rewritten CSS blob
 */

/**
 * Process a CSS file and rewrite it
 *
 * Browser normally determine the charset of a CSS file via:
 * 1. HTTP header content-type
 * 2. Unicode BOM in the CSS file
 * 3. @charset rule in the CSS file
 * 4. assume it's UTF-8
 *
 * We save the CSS file as UTF-8 for better compatibility.
 * For case 3, a UTF-8 BOM is prepended to suppress the @charset rule.
 * We don't follow case 4 and save the CSS file as byte string so that
 * the user could fix the encoding manually.
 *
 * @param {Blob} data
 * @param {string} charset
 * @param {parseCssFileRewriteFunc} rewriteFunc
 * @param {parseCssFileCallback} onComplete
 */
scrapbook.parseCssFile = function (data, charset, rewriteFunc, onComplete) {
  var readCssText = function (blob, charset, callback) {
    var reader = new FileReader();
    reader.addEventListener("loadend", () => {
      callback(reader.result);
    });
    reader.readAsText(blob, charset);
  };

  var readCssBytes = function (blob, callback) {
    var reader = new FileReader();
    reader.addEventListener("loadend", () => {
      var bstr = scrapbook.arrayBufferToByteString(reader.result);
      callback(bstr);
    });
    reader.readAsArrayBuffer(blob);
  };

  var processCss = function (oldText) {
    rewriteFunc(oldText, (text) => {
      if (charset) {
        var blob = new Blob([text], {type: "text/css;charset=UTF-8"});
      } else {
        var ab = scrapbook.byteStringToArrayBuffer(text);
        var blob = new Blob([ab], {type: "text/css"});
      }
      onComplete(blob);
    });
  };

  if (charset) {
    readCssText(data, charset, (text) => {
      processCss(text);
    });
  } else {
    readCssBytes(data, (bytes) => {
      if (bytes.startsWith("\xEF\xBB\xBF")) {
        charset = "UTF-8";
      } else if (bytes.startsWith("\xFE\xFF")) {
        charset = "UTF-16BE";
      } else if (bytes.startsWith("\xFF\xFE")) {
        charset = "UTF-16LE";
      } else if (bytes.startsWith("\x00\x00\xFE\xFF")) {
        charset = "UTF-32BE";
      } else if (bytes.startsWith("\x00\x00\xFF\xFE")) {
        charset = "UTF-32LE";
      } else if (/^@charset (["'])(\w+)\1;/.test(bytes)) {
        charset = RegExp.$2;
      }
      if (charset) {
        readCssText(data, charset, (text) => {
          // The read text does not contain a BOM.
          // Add a BOM so that browser will read this CSS as UTF-8 in the future.
          // This added UTF-16 BOM will be converted to UTF-8 BOM automatically when creating blob.
          text = "\ufeff" + text;
          processCss(text);
        });
      } else {
        processCss(bytes);
      }
    });
  }
};

/**
 * The function that rewrites each URL into a new URL.
 *
 * @callback parseCssTextRewriteFunc
 * @param {string} url
 * @return {string} newUrl
 */

/**
 * process the CSS text of whole <style> or a CSS file
 *
 * @TODO: current code is rather heuristic and ugly,
 *        consider implementing a real CSS parser to prevent potential errors
 *        for certain complicated CSS
 *
 * @param {string} cssText
 * @param {Object} rewriteFuncs
 *     - {parseCssTextRewriteFunc} rewriteImportUrl
 *     - {parseCssTextRewriteFunc} rewriteFontFaceUrl
 *     - {parseCssTextRewriteFunc} rewriteBackgroundUrl
 */
scrapbook.parseCssText = function (cssText, rewriteFuncs) {
  var pCm = "(?:/\\*[\\s\\S]*?\\*/)"; // comment
  var pSp = "(?:[ \\t\\r\\n\\v\\f]*)"; // space equivalents
  var pCmSp = "(?:" + "(?:" + pCm + "|" + pSp + ")" + "*" + ")"; // comment or space
  var pChar = "(?:\\\\.|[^\\\\])"; // a char, or a escaped char sequence
  var pStr = "(?:" + pChar + "*?" + ")"; // string
  var pSStr = "(?:" + pCmSp + pStr + pCmSp + ")"; // spaced string
  var pDQStr = "(?:" + '"' + pStr + '"' + ")"; // double quoted string
  var pSQStr = "(?:" + "'" + pStr + "'" + ")"; // single quoted string
  var pES = "(?:" + "(?:" + [pCm, pDQStr, pSQStr, pChar].join("|") + ")*?" + ")"; // embeded string
  var pUrl = "(?:" + "url\\(" + pSp + "(?:" + [pDQStr, pSQStr, pSStr].join("|") + ")" + pSp + "\\)" + ")"; // URL
  var pUrl2 = "(" + "url\\(" + pSp + ")(" + [pDQStr, pSQStr, pSStr].join("|") + ")(" + pSp + "\\)" + ")"; // URL; catch 3
  var pRImport = "(" + "@import" + pCmSp + ")(" + [pUrl, pDQStr, pSQStr].join("|") + ")(" + pCmSp + ";" + ")"; // rule import; catch 3
  var pRFontFace = "(" + "@font-face" + pCmSp + "{" + pES + "}" + ")"; // rule font-face; catch 1

  var parseUrl = function (text, callback) {
    return text.replace(new RegExp(pUrl2, "gi"), (m, pre, url, post) => {
      if (url.startsWith('"') && url.endsWith('"')) {
        var url = scrapbook.unescapeCss(url.slice(1, -1));
        var ret = callback(url);
      } else if (url.startsWith("'") && url.endsWith("'")) {
        var url = scrapbook.unescapeCss(url.slice(1, -1));
        var ret = callback(url);
      } else {
        var url = scrapbook.unescapeCss(url.trim());
        var ret = callback(url);
      }
      return pre + '"' + scrapbook.escapeQuotes(ret) + '"' + post;
    });
  };

  var cssText = cssText.replace(
    new RegExp([pCm, pRImport, pRFontFace, "("+pUrl+")"].join("|"), "gi"),
    (m, im1, im2, im3, ff, u) => {
      if (im2) {
        if (im2.startsWith('"') && im2.endsWith('"')) {
          var url = scrapbook.unescapeCss(im2.slice(1, -1));
          var ret = 'url("' + scrapbook.escapeQuotes(rewriteFuncs.rewriteImportUrl(url)) + '")';
        } else if (im2.startsWith("'") && im2.endsWith("'")) {
          var url = scrapbook.unescapeCss(im2.slice(1, -1));
          var ret = 'url("' + scrapbook.escapeQuotes(rewriteFuncs.rewriteImportUrl(url)) + '")';
        } else {
          var ret = parseUrl(im2, rewriteFuncs.rewriteImportUrl);
        }
        return im1 + ret + im3;
      } else if (ff) {
        return parseUrl(m, rewriteFuncs.rewriteFontFaceUrl);
      } else if (u) {
        return parseUrl(m, rewriteFuncs.rewriteBackgroundUrl);
      }
      return m;
    });
  return cssText;
};

/**
 * The function that rewrites each URL into a new URL.
 *
 * @callback parseSrcsetRewriteFunc
 * @param {string} url
 * @return {string} newUrl
 */

/**
 * @param {string} srcset
 * @param {parseSrcsetRewriteFunc} rewriteFunc
 */
scrapbook.parseSrcset = function (srcset, rewriteFunc) {
  return srcset.replace(/(\s*)([^ ,][^ ]*[^ ,])(\s*(?: [^ ,]+)?\s*(?:,|$))/g, (m, m1, m2, m3) => {
    return m1 + rewriteFunc(m2) + m3;
  });
};


/********************************************************************
 * Network utilities
 *******************************************************************/

/**
 * The callback function that aborts the XMLHttpRequest when called.
 *
 * @callback xhrAbortCallback
 */

/**
 * @callback xhrEventHandler
 * @param {XMLHttpRequest} xhr
 * @param {xhrAbortCallback} xhrAbort
 */

/**
 * A simple XMLHttpRequest wrapper for most common tasks
 *
 * @param {Object} params
 *     - {string} params.url
 *     - {string} params.responseType
 *     - {xhrEventHandler} params.onreadystatechange
 *     - {xhrEventHandler} params.onloadend
 *     - {xhrEventHandler} params.onerror
 *     - {xhrEventHandler} params.ontimeout
 */
scrapbook.xhr = function (params) {
  var xhr = new XMLHttpRequest();

  var xhrAbort = function () {
    xhr.onreadystatechange = xhr.onloadend = xhr.onerror = xhr.ontimeout = null;
    xhr.abort();
  };

  xhr.onreadystatechange = function () {
    params && params.onreadystatechange && params.onreadystatechange(xhr, xhrAbort);
  };

  xhr.onloadend = function () {
    if (xhr.status == 200 || xhr.status == 0) {
      // we only care about real loading success
      params && params.onloadend && params.onloadend(xhr, xhrAbort);
    } else {
      // treat "404 Not found" or so as error
      xhr.onerror();
    }
  };

  xhr.onerror = function () {
    params && params.onerror && params.onerror(xhr);
    xhrAbort();
  };

  xhr.ontimeout = function () {
    var handler = params && params.ontimeout || params.onerror;
    handler && handler(xhr);
    xhrAbort();
  };

  try {
    xhr.responseType = params.responseType;
    xhr.open("GET", params.url, true);
    xhr.send();
  } catch (ex) {
    console.error(ex);
    xhr.onerror();
  }
};
