"use strict";
/* global $ FStar */

FStar.IDE = FStar.IDE || {};
FStar.IDE.LiterateClient = FStar.IDE.LiterateClient || {};

(function() {
    var _ = FStar._;

    var SNIPPET_STATE = FStar.IDE.Client.SNIPPET_STATE;

    var Snippet = FStar.IDE.LiterateClient.Snippet = function(id, ui, editor, client) {
        this.id = id;
        this.ui = ui;
        this.editor = editor;
        this.client = client;

        this.state = null;
        this.previousSnippet = null;
        this.nextSnippet = null;
    };

    Snippet.prototype.getId = function () {
        return this.id;
    };

    Snippet.prototype.getText = function () {
        return this.editor.getValue() + "\n\n";
    };

    Snippet.prototype.getState = function () {
        return this.state;
    };

    var STATE_UI = FStar.IDE.LiterateClient.STATE_UI = {};
    STATE_UI[SNIPPET_STATE.PENDING] = {
        label: "waiting for previous snippets…",
        editorClassName: "fstar-snippet fstar-snippet-pending",
        progressBarClassName: "fstar-progress-bar-pending"
    };
    STATE_UI[SNIPPET_STATE.BUSY] = {
        label: "typechecking…",
        editorClassName: "fstar-snippet fstar-snippet-busy",
        progressBarClassName: "fstar-progress-bar-busy"
    };
    STATE_UI[SNIPPET_STATE.DONE] = {
        label: "typechecked ✓",
        editorClassName: "fstar-snippet fstar-snippet-done",
        progressBarClassName: "fstar-progress-bar-done"
    };

    var PROGRESS_BAR_CLASSES = _.map(STATE_UI, function(ui) {
        return ui.progressBarClassName;
    }).join(" ");

    Snippet.prototype.updateClassAndLabel = function(label) {
        this.ui.$progressBarElement.removeClass(PROGRESS_BAR_CLASSES);
        if (this.state !== null) {
            var ui = STATE_UI[this.state];
            this.ui.$top.attr("class", ui.editorClassName);
            this.ui.$statusLabel.text(label || ui.label);
            this.ui.$progressBarElement.addClass(ui.progressBarClassName);
        } else {
            this.ui.$top.attr("class", "fstar-snippet");
            this.ui.$statusLabel.text("");
        }
    };

    Snippet.prototype.setState = function(state) {
        this.state = state;
        this.updateClassAndLabel();
    };

    Snippet.prototype.complain = function(message) {
        console.log(message);
        this.ui.$complaintBox.text(message).show().delay(4000).fadeOut(500);
    };

    function addRangeMarker(range, className, options) {
        if (range.snippet !== undefined) {
            return range.snippet.editor.markText(
                { line: range.beg[0] - 1, ch: range.beg[1] },
                { line: range.end[0] - 1, ch: range.end[1] },
                _.extend({ className: className }, options || {}));
        }
    }

    function ensureVisible($element) {
        var elem_start = $element.offset().top;
        var vp_start = $(window).scrollTop();

        var elem_end = elem_start + $element.height();
        var vp_end = vp_start + window.innerHeight;

        if (elem_start < vp_start) {
            $("html, body").animate({ scrollTop: elem_start }, 200);
        } else if (elem_end > vp_end) {
            $("html, body").animate({ scrollTop: elem_end - window.innerHeight }, 200);
        }
    }

    function scrollToEditor(editor) {
        editor.fstarSnippet.ui.$top[0].scrollIntoView();
        editor.focus();
    }

    function setCursor(editor, pos) {
        editor.focus();
        editor.setCursor(pos[0] - 1, pos[1]);
    }

    function visitRange(range) {
        ensureVisible(range.snippet.ui.$top);
        setCursor(range.snippet.editor, range.beg);
    }

    function highlightRange(range) {
        if (!range.highlighter) {
            range.highlighter = addRangeMarker(range, "fstar-highlighted-marker");
        }
    }

    function unhighlightRange(range) {
        if (range.highlighter) {
            range.highlighter.clear();
            delete range.highlighter;
        }
    }

    function formatEndPoint(point) {
        return point[0] + "," + point[1];
    }

    function formatRange(range) {
        return $("<span>", { "class": "fstar-error-range", "role": "button" })
            .append(
                [$('<span class="fstar-range-fname">').text(range.fname),
                 document.createTextNode("("),
                 $('<span class="fstar-range-snippet">').text("snippet #" + (range.snippet.id + 1)),
                 document.createTextNode("): "),
                 $('<span class="fstar-range-beg">').text(formatEndPoint(range.beg)),
                 document.createTextNode("–"),
                 $('<span class="fstar-range-end">').text(formatEndPoint(range.end))]);
    }

    function formatError(error) {
        var $error_span = $("<span>", { "class": "fstar-" + error.level });
        $error_span.append($("<span>", { "class": "fstar-error-level" }).text(error.level));
        $error_span.append($("<span>", { "class": "fstar-error-message" }).text(error.message));
        _.each(error.ranges, function(range) {
            $error_span
                .append(formatRange(range).click(_.bind(visitRange, {}, range)))
                .hover(_.bind(highlightRange, {}, range),
                       _.bind(unhighlightRange, {}, range));
        }, this);
        return $error_span;
    }

    Snippet.prototype.clearErrors = function() {
        _.each(this.errors, function(error) {
            _.each(error.ranges, function(range) {
                _.each(["marker", "highlighter"], function(markerName) {
                    if (range[markerName]) {
                        range[markerName].clear();
                        delete range[markerName];
                    }
                });
            });
        });
        this.errors = [];
    };

    Snippet.prototype.setErrors = function(errors) {
        this.ui.$errorPanel.empty();
        this.clearErrors();

        var firstLocalRange;
        this.ui.$errorPanel.append(_.map(errors, formatError));
        _.each(errors, function(error) {
            _.each(error.ranges, function(range) {
                if (firstLocalRange === undefined && range.snippet === this) {
                    firstLocalRange = range;
                }
                range.marker =
                    addRangeMarker(range, "fstar-" + error.level + "-marker",
                                   { title: error.message });
            }, this);
        }, this);

        var hasErrors = errors.length > 0;
        this.ui.$errorPanel.toggle(hasErrors);
        if (hasErrors && firstLocalRange !== undefined) {
            setCursor(this.editor, firstLocalRange.beg);
        }

        this.errors = errors;
    };

    Snippet.prototype.lineage = function(predicate) {
        var last = this;
        var ancestors = [];
        while (last !== null && predicate(last)) {
            ancestors.push(last);
            last = last.previousSnippet;
        }
        return ancestors.reverse();
    };

    Snippet.prototype.submitSelf = function () {
        this.client.submit(this, this.previousSnippet);
    };

    Snippet.prototype.submit = function () {
        var ancestors = this.lineage(function (parent) { return parent.state == null; });
        _.each(ancestors, function(snippet) { snippet.submitSelf(); });
    };

    Snippet.prototype.cancel = function () {
        return this.client.cancel(this);
    };

    /// Singleton

    function Instance(fname) {
        this.fname = fname;
        this.justBlurredEditor = null;

        this.$progressBar = $('<div class="fstar-progress-bar">');
        $("body").append(this.$progressBar);

        this.client = new FStar.IDE.Client();
        this.snippets = this.prepareFStarSnippets();
        chainSnippets(this.snippets);

        var fcontents = this.getFileContents();
        // "--lax", "--admit_smt_queries", "true",
        var args = ["--z3refresh", "--fstar_home", "/fstar"];
        this.client.init(fname, fcontents, args);
    }

    function jumpTo(snippet) {
        if (snippet !== null) {
            snippet.editor.focus();
            ensureVisible(snippet.ui.$top);
        }
    }

    function onSubmitKey(editor) { editor.fstarSnippet.submit(); }
    function onPreviousKey(editor) { jumpTo(editor.fstarSnippet.previousSnippet); }
    function onNextKey(editor) { jumpTo(editor.fstarSnippet.nextSnippet); }

    function onBeforeEditorChange(cm, changeObj) {
        var snippet = cm.fstarSnippet;
        var cancelSnippetResult = snippet.cancel();
        if (!cancelSnippetResult.success) {
            changeObj.cancel();
            snippet.complain(cancelSnippetResult.reason);
        }
    }

    function onEditorChanges(cm, _changes) {
        cm.fstarSnippet.ui.$progressBarElement.css("flex-grow", 1 + cm.lineCount());
    }

    function onEditorFocus(cm) {
        cm.fstarSnippet.ui.$progressBarElement.addClass("fstar-active-progress-bar-element");
    }

    Instance.prototype.onEditorBlur = function(cm, _event) {
        this.justBlurredEditor = cm;
        cm.fstarSnippet.ui.$progressBarElement.removeClass("fstar-active-progress-bar-element");
        window.setTimeout(2, function () { this.justBlurredEditor = null; });
    };

    var CM_OPTIONS = {
        viewportMargin: Infinity, // Used in conjunction with ‘height: auto’
        extraKeys: {
            "Ctrl-Enter": onSubmitKey,
            "Ctrl-Alt-Enter": onSubmitKey,
            "Ctrl-Alt-Up": onPreviousKey,
            "Ctrl-Alt-Down": onNextKey
        }
    };

    Instance.prototype.submitMaybeComplain = function(snippet) {
        snippet.submit();
        if (this.justBlurredEditor !== null && snippet === this.justBlurredEditor.fstarSnippet) {
            snippet.complain("Tip: You can use Ctrl-Return to typecheck the current snippet");
        }
    };

    function allMatchingIndices(regexp, string) {
        var offsets = [], match = null;
        while ((match = regexp.exec(string))) {
            offsets.push(match.index);
        }
        return offsets;
    }

    function pointToLineColumn(point, line_end_positions) {
        var line = _.sortedIndex(line_end_positions, point);
        var col = point - (line > 0 ? line_end_positions[line - 1] + 1 : 0);
        return { line: line, ch: col };
    }

    function collapseElidedBlocks(editor, text) {
        var hidden_blocks = /\(\* \{\{\{([^\0]*?)\*\)[^\0]*?\(\* \}\}\} \*\)/g;
        var match = null, ranges = [], eols = null;

        while ((match = hidden_blocks.exec(text))) {
            eols = eols || allMatchingIndices(/\n/g, text);
            ranges.push({ start: pointToLineColumn(match.index, eols),
                          end: pointToLineColumn(match.index + match[0].length, eols),
                          replacement: "(* …" + match[1] + "*)" });
        }

        _.each(ranges, function (range) {
            var $repNode = $('<span class="cm-comment">')
                .text(range.replacement)
                .prop("title", "Click to reveal elided text");
            var marker = editor.markText(range.start, range.end,
                                         { clearOnEnter: true,
                                           replacedWith: $repNode[0] });
            $repNode.click(function() { marker.clear(); });
        });
    }

    Instance.prototype.prepareFStarSnippet = function(id, editorDiv) {
        var ui = {
            $top: $(editorDiv),
            $controlPanel: $('<div class="fstar-control-panel">'),
            $errorPanel: $('<div class="fstar-error-panel">'),
            $complaintBox: $('<span class="fstar-snippet-complaint">'),
            $statusLabel: $('<span class="fstar-snippet-status">'),
            $submitButton: $('<span class="fstar-snippet-submit">', { "role": "button" }),
            $progressBarElement: $('<span class="fstar-progress-bar-element">'),
        };

        this.$progressBar.append(ui.$progressBarElement);

        var text = FStar.ClientUtils.stripNewLines(ui.$top.text());
        ui.$top.empty();
        ui.$top.attr("class", "fstar-snippet");

        var editor = FStar.ClientUtils.setupEditor(ui.$top[0], text, CM_OPTIONS);
        editor.on("beforeChange", onBeforeEditorChange);
        editor.on("changes", onEditorChanges);
        editor.on("focus", onEditorFocus);
        editor.on("blur", _.bind(this.onEditorBlur, this));
        collapseElidedBlocks(editor, text);
        ui.$progressBarElement.css("flex-grow", 1 + editor.lineCount());
        ui.$progressBarElement.click(_.bind(scrollToEditor, {}, editor));

        ui.$editor = $(editor.getWrapperElement());
        ui.$top.append(ui.$controlPanel);

        ui.$submitButton.text("typecheck this");
        ui.$controlPanel
            .append(ui.$errorPanel)
            .append(ui.$complaintBox)
            .append(ui.$submitButton)
            .append(ui.$statusLabel);

        var snippet = new FStar.IDE.LiterateClient.Snippet(id, ui, editor, this.client);
        ui.$submitButton.click(_.bind(this.submitMaybeComplain, this, snippet));

        editor.fstarSnippet = snippet;
        return snippet;
    };

    Instance.prototype.prepareFStarSnippets = function() {
        return $(".fstar").map($.proxy(function(id, editorDiv) { // _.bind doesn't work here
            return this.prepareFStarSnippet(id, editorDiv);
        }, this)).toArray();
    };

    function chainSnippets(snippets) {
        for (var snippet_id = 0; snippet_id < snippets.length; snippet_id++) {
            var snippet = snippets[snippet_id];
            var prev_id = snippet_id - 1, next_id = snippet_id + 1;
            if (prev_id >= 0) {
                snippet.previousSnippet = snippets[prev_id];
            }
            if (next_id < snippets.length) {
                snippet.nextSnippet = snippets[next_id];
            }
        }
    }

    Instance.prototype.getFileContents = function() {
        return this.snippets.map(function(snippet) {
            return snippet.getText();
        }).join("");
    };

    FStar.IDE.LiterateClient.instance = null;
    FStar.IDE.LiterateClient.run = function (fname) {
        FStar.IDE.LiterateClient.instance = FStar.IDE.LiterateClient.instance || new Instance(fname);
    };
})();
