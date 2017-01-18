// HyperMD, copyright (c) by laobubu
// Distributed under an MIT license: http://laobubu.net/hypermd/LICENSE

// Folding and rendering with MathJax

(function (mod) {
  var CODEMIRROR_ROOT = window.CODEMIRROR_ROOT || "../../node_modules/codemirror/";
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(
      require(CODEMIRROR_ROOT + "lib/codemirror")
    );
  else if (typeof define == "function" && define.amd) // AMD
    define([
      CODEMIRROR_ROOT + "lib/codemirror"
    ], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function (CodeMirror) {
  "use strict";

  var DEBUG = false

  function processRange(cm, fromLine, toLine) {
    var curpos = cm.getCursor()
    fromLine = ~~fromLine
    toLine = typeof toLine === "number" ? Math.min(~~toLine, cm.lineCount() - 1) : cm.lineCount() - 1
    cm.eachLine(fromLine, toLine + 1, processLine.bind(this, cm, curpos))
  }

  // /**
  //  * get the count of masked chars before the (beforeCh)th char
  //  * 
  //  * assuming `beforeCh` is not masked!
  //  * 
  //  * @param {object} line the lineHandle
  //  * @returns {number}
  //  */
  // function getMaskedCharCount(line, beforeCh) {
  //   if (!line.markedSpans) return 0
  //   var ret = 0
  //   /** @type {{from:number,to:number}[]} */
  //   var markedSpans = line.markedSpans.map(function (ms) { return ({ from: ms.from, to: ms.to }) })
  //   markedSpans = markedSpans.sort(function (a, b) { return (a.from > b.from) })  // sort: small -> big
  //   for (var i = 0; i < markedSpans.length; i++) {
  //     var cur = markedSpans[i]
  //     if (cur.from > beforeCh) return ret
  //     ret += cur.to - cur.from

  //     // remove "subsets"
  //     //  +-----------------+ cur
  //     //  |   +-----------+-+
  //     //  |   | subset(s) | |
  //     while (++i < markedSpans.length) {
  //       var next = markedSpans[i]
  //       if (!(next.from >= cur.from && next.to <= cur.to)) break
  //     }
  //     i--
  //   }
  //   return ret
  // }

  function processLine(cm, curpos, line) {
    if (!line) return

    var lineNo = line.lineNo()
    var avoid_ch = (curpos && (lineNo == curpos.line)) ? curpos.ch : -1

    // vars used while iterating chars
    var s = line.styles, s$i = 1 - 2
    if (!s) return

    /** @type {{from:number,to:number}[]} */
    var markedSpans = line.markedSpans && line.markedSpans.map(function (ms) { return ({ from: ms.from, to: ms.to }) }) || []
    markedSpans = markedSpans.sort(function (a, b) { return (a.from > b.from) })  // sort: small -> big
    var mark$i = 0, mark$ = markedSpans[0]

    while (s$i += 2, typeof s[s$i] == 'number') {
      var chFrom = s[s$i - 2] || 0, chTo = s[s$i], chStyle = s[s$i + 1]

      if (chStyle == "math") {
        var expr = line.text.substr(chFrom, chTo - chFrom)
        if (DEBUG) console.log("wow such math", expr)
        chFrom = s[s$i - 4] || 0
        chTo = s[s$i + 2] || chTo + 1
      } else {
        continue
      }

      // if cursor is in section, do not insert
      if (avoid_ch >= chFrom && avoid_ch <= chTo) continue

      // if the section is marked, skip
      while (mark$ && mark$.to < chFrom) mark$ = markedSpans[++mark$i]
      if (
        mark$ &&
        ((chFrom >= mark$.from && chFrom <= mark$.to) ||
          (chTo >= mark$.from && chTo <= mark$.to))
      ) continue

      // do folding
      insertMathMark(cm, lineNo, chFrom, chTo, expr)
    }

  }

  /**
   * move cursor to where marker is 
   * 
   * @param {number} chOffset >= 1
   */
  function breakMark(cm, marker, chOffset) {
    var line = marker.lines[0], ms = line.markedSpans
    for (var i = 0; i < ms.length; i++) {
      var s = ms[i]
      if (s.marker === marker) {
        cm.setCursor({ line: line.lineNo(), ch: s.from + ~~chOffset })
        return
      }
    }
  }

  function insertMathMark(cm, line, ch1, ch2, expression) {
    var span = document.createElement("span"), marker
    span.setAttribute("class", "hmd-fold-math")
    span.setAttribute("title", expression)
    span.setAttribute("data-expression", expression)
    span.textContent = "[[[" + expression + "]]]"

    var p1 = { line: line, ch: ch1 }, p2 = { line: line, ch: ch2 }
    if (DEBUG) console.log("insert", p1, p2, expression)

    var update_pp2 = { line: line, ch: ch1 + 1 }
    marker = cm.markText(p1, p2, {
      className: "hmd-fold-math",
      replacedWith: span,
      clearOnEnter: true
    })
    span.addEventListener("click", function (ev) {
      breakMark(cm, marker, 1)
      cm.focus()
    }, false)
  }

  function Fold(cm) {
    this.cm = cm
    this.delay = 200
    this.timeoutHandle = 0

    this._doFold = this.doFold.bind(this)
  }
  Fold.prototype = {
    doFold: function () {
      var self = this, cm = self.cm
      if (self.timeoutHandle) clearTimeout(self.timeoutHandle)
      self.timeoutHandle = setTimeout(function () {
        self.timeoutHandle = 0
        cm.operation(function () {
          processRange(cm, cm.display.viewFrom, cm.display.viewTo)
        })
      }, self.delay)
    }
  }

  function initFoldFor(cm) {
    if (!cm.hmd) cm.hmd = {}
    else if (cm.hmd.foldMath) return cm.hmd.foldMath

    var fold = new Fold(cm)
    cm.hmd.foldMath = fold
    fold._doFold()
    return fold
  }

  CodeMirror.defineInitHook(function (cm) { initFoldFor(cm) })

  CodeMirror.defineOption("hmdAutoFoldMath", 200, function (cm, newVal, oldVal) {
    var fold = initFoldFor(cm)
    if (oldVal == 'CodeMirror.Init') oldVal = 0
    if ((newVal = ~~newVal) < 0) newVal = 0

    if (oldVal && !newVal) { // close this feature
      cm.off("update", fold._doFold)
      cm.off("cursorActivity", fold._doFold)
    }
    if (!oldVal && newVal) {
      cm.on("update", fold._doFold)
      cm.on("cursorActivity", fold._doFold)
    }
    fold.delay = newVal
  })

})