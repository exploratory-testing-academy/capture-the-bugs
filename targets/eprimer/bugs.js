// Each bug has a `matchText` field: a description written from a tester's perspective,
// optimized for semantic similarity matching against free-text user reports.
// For input-triggerable bugs, `triggerPattern` describes the CLASS of inputs that trigger it.

export const bugs = [
  // ─── E-Prime Detection (1–9) ───────────────────────────────────────────────
  {
    id: 1,
    title: "Contractions of 'to be' not detected",
    category: "E-Prime Detection",
    inputTriggerable: true,
    triggerPattern: "Input contains a to-be contraction missing from the discouraged list: you're, we're, they're, he's, she's, it's, there's, that's, who's",
    matchText: "Contractions like you're, we're, they're, he's, she's, it's, there's, that's are not detected or highlighted as e-prime violations even though they contain forms of to be. The tool completely ignores these contractions.",
    difficulty: 2,
    points: 10
  },
  {
    id: 2,
    title: "Single quotes hide violations",
    category: "E-Prime Detection",
    inputTriggerable: true,
    triggerPattern: "Input contains a discouraged word wrapped in single-quote apostrophes, e.g. 'is', 'are', 'was'",
    matchText: "Words enclosed in single quotes like 'is' or 'are' are not detected as violations. When a discouraged word is surrounded by apostrophes the tool misses it because the quotes become part of the word.",
    difficulty: 3,
    points: 15
  },
  {
    id: 3,
    title: "Curly vs straight apostrophe handled differently",
    category: "E-Prime Detection",
    inputTriggerable: true,
    triggerPattern: "Input contains the same word spelled with both a curly/smart apostrophe (\u2019) and a straight apostrophe (')",
    matchText: "The tool treats curly smart apostrophes differently from straight typewriter apostrophes. The same word like it\u2019s versus it's gives different results. Inconsistent apostrophe handling between typographer and keyboard apostrophes.",
    difficulty: 3,
    points: 15
  },
  {
    id: 4,
    title: "Typesetter apostrophe not recognized",
    category: "E-Prime Detection",
    inputTriggerable: true,
    triggerPattern: "Input contains words with curly/smart/typesetter apostrophe character (\u2018 or \u2019) such as I\u2019m, don\u2019t, isn\u2019t",
    matchText: "Curly or smart apostrophes are not recognized by the tool. When text is pasted from Word or a phone and contains curved apostrophe characters, words like I\u2019m or don\u2019t get split into separate pieces instead of being detected as contractions.",
    difficulty: 3,
    points: 15
  },
  {
    id: 5,
    title: "No context awareness for 'being'",
    category: "E-Prime Detection",
    inputTriggerable: true,
    triggerPattern: "Input contains 'being' used as a noun rather than a verb, e.g. 'human being', 'a being', 'living being'",
    matchText: "The word being is always flagged as a discouraged word even when used as a noun. Phrases like a human being or a living being should not be violations because being here means a creature or entity, not the verb to be.",
    difficulty: 3,
    points: 15
  },
  {
    id: 6,
    title: "HTML tags create false positives",
    category: "E-Prime Detection",
    inputTriggerable: true,
    triggerPattern: "Input contains HTML-like angle bracket content such as <b>, <div>, <html>, or any <tag> markup",
    matchText: "Entering HTML tags or angle brackets like <b> or <html> causes letters from the tag names to be extracted as separate words. The tool incorrectly parses HTML markup and may flag tag letters as violations.",
    difficulty: 3,
    points: 15
  },
  {
    id: 7,
    title: "Double quotes caught but single quotes not",
    category: "E-Prime Detection",
    inputTriggerable: true,
    triggerPattern: "Input contains a discouraged word in both double quotes and single quotes for comparison, e.g. \"is\" vs 'is'",
    matchText: "A discouraged word in double quotes like \"is\" gets detected but the same word in single quotes like 'is' does not. The tool treats single and double quoted words differently, missing violations in single-quoted text.",
    difficulty: 3,
    points: 15
  },
  {
    id: 8,
    title: "Possessive names incorrectly flagged",
    category: "E-Prime Detection",
    inputTriggerable: true,
    triggerPattern: "Input contains a possessive proper name with an apostrophe, especially compound names like O'Brien's, McDonald's",
    matchText: "Possessive proper names like O'Brien's or McDonald's are incorrectly flagged as possible e-prime violations. The tool thinks the 's indicates a contraction of is but it actually shows possession.",
    difficulty: 2,
    points: 10
  },
  {
    id: 9,
    title: "Plural possessives not detected",
    category: "E-Prime Detection",
    inputTriggerable: true,
    triggerPattern: "Input contains a plural possessive word ending with an apostrophe but no s, e.g. dogs', teachers', parents'",
    matchText: "Plural possessives are not detected. Words like dogs' or teachers' with a trailing apostrophe after the s are not flagged, while singular possessives like dog's are. The tool only checks for 's ending not s' ending.",
    difficulty: 3,
    points: 15
  },

  // ─── Word Count (10–14) ────────────────────────────────────────────────────
  {
    id: 10,
    title: "Word count wrong with newlines",
    category: "Word Count",
    inputTriggerable: true,
    triggerPattern: "Input contains multiple words separated by newline characters (pressing Enter) rather than or in addition to spaces",
    matchText: "The word count is incorrect when text contains line breaks or newlines. Typing words on separate lines by pressing Enter gives the wrong word count. Words separated by Enter instead of space are not counted correctly.",
    difficulty: 1,
    points: 5
  },
  {
    id: 11,
    title: "Newline-separated words counted as one",
    category: "Word Count",
    inputTriggerable: true,
    triggerPattern: "Input contains words on separate lines with no spaces, only newline characters between them",
    matchText: "Multiple words on separate lines are counted as a single word. When each word is on its own line the word count shows 1 instead of the actual number of words. Line breaks do not work as word separators for counting.",
    difficulty: 1,
    points: 5
  },
  {
    id: 12,
    title: "Only spaces count as word separators",
    category: "Word Count",
    inputTriggerable: true,
    triggerPattern: "Input contains words separated by non-space characters like tabs, semicolons, commas, dashes, or other punctuation",
    matchText: "Only space characters are treated as word separators. Words separated by tabs, punctuation, semicolons, commas, or other special characters are all counted as one word. The word count only recognizes the space character as a word boundary.",
    difficulty: 2,
    points: 10
  },
  {
    id: 13,
    title: "Curly apostrophe splits words in count",
    category: "Word Count",
    inputTriggerable: true,
    triggerPattern: "Input contains contractions written with curly/smart apostrophes like I\u2019m, don\u2019t, you\u2019re",
    matchText: "Contractions with curly or smart apostrophes are counted as two words instead of one. I\u2019m becomes two words I and m. Text pasted from Word or phone with smart quotes inflates the word count because curved apostrophes split words.",
    difficulty: 3,
    points: 15
  },
  {
    id: 14,
    title: "Violation count contradicts word count",
    category: "Word Count",
    inputTriggerable: true,
    triggerPattern: "Input contains discouraged words separated by non-space characters, e.g. is;is or is-is, so that violation count exceeds word count",
    matchText: "The number of violations or discouraged words found can be higher than the total word count. The violation detector and word counter use different logic to split words so they disagree. More violations than words should be impossible but the tool shows it.",
    difficulty: 3,
    points: 15
  },

  // ─── Input Handling (15) ───────────────────────────────────────────────────
  {
    id: 15,
    title: "Empty input accepted without warning",
    category: "Input Handling",
    inputTriggerable: true,
    triggerPattern: "Input is empty (blank text field) when clicking the check button",
    matchText: "The tool accepts empty input without any error or warning. Clicking the check button with nothing in the text field just shows zero counts instead of telling the user to enter some text. No validation on empty or blank input.",
    difficulty: 1,
    points: 5
  },

  // ─── Display (20, 21, 24, 27) ─────────────────────────────────────────────
  {
    id: 20,
    title: "Extra line breaks from special characters",
    category: "Display",
    inputTriggerable: true,
    triggerPattern: "Input starts with blank lines, or contains consecutive newlines (multiple Enter presses in a row)",
    matchText: "Special characters or blank lines at the beginning of input cause extra line breaks and spacing in the output. Multiple consecutive Enter presses create excessive gaps or empty paragraphs in the displayed result.",
    difficulty: 2,
    points: 10
  },
  {
    id: 21,
    title: "Trailing spaces cause alignment issues",
    category: "Display",
    inputTriggerable: true,
    triggerPattern: "Input contains trailing spaces before a newline, e.g. a line ending with extra spaces before pressing Enter",
    matchText: "Trailing spaces at the end of lines cause misalignment in the output. When a line has extra spaces before a line break the output display shows visual alignment problems or unexpected whitespace.",
    difficulty: 3,
    points: 15
  },
  {
    id: 24,
    title: "Long text overflows the output box",
    category: "Display",
    inputTriggerable: true,
    triggerPattern: "Input contains a very long word or string without any spaces or breakpoints",
    matchText: "Very long words or text without spaces overflows and extends beyond the output box boundary. The text goes outside the grey container with no wrapping or horizontal scrollbar. Long unbroken strings are not handled.",
    difficulty: 2,
    points: 10
  },
  {
    id: 27,
    title: "Cannot distinguish l from I in font",
    category: "Display",
    inputTriggerable: true,
    triggerPattern: "Input contains words where lowercase L and uppercase I appear near each other, e.g. Illegal, Illusion, Illinois",
    matchText: "The font makes it impossible or very difficult to tell apart lowercase L and uppercase I. Letters l and I look identical. Words like Illegal or Ill are hard to read because you cannot distinguish the characters in the chosen typeface.",
    difficulty: 2,
    points: 10
  },

  // ─── Performance (32) ─────────────────────────────────────────────────────
  {
    id: 32,
    title: "Performance degrades with large input",
    category: "Performance",
    inputTriggerable: true,
    triggerPattern: "Input is an extremely large text, roughly 10,000+ words or more",
    matchText: "The application becomes very slow, freezes, or crashes when processing a large amount of text. Pasting a big document or a very long text makes the tool unresponsive. Performance problems with large input.",
    difficulty: 2,
    points: 10
  },

  // ─── Internationalization (39, 40, 41) ─────────────────────────────────────
  {
    id: 39,
    title: "Non-English characters break word display",
    category: "Internationalization",
    inputTriggerable: true,
    triggerPattern: "Input contains accented Latin characters such as \u00e9, \u00e8, \u00f1, \u00fc, \u00e4, \u00f6, \u00e7 (French, Spanish, German, etc.)",
    matchText: "Accented characters or special letters from European languages like \u00e9 \u00f1 \u00fc \u00e4 \u00f6 are treated as word separators. Words like caf\u00e9 or na\u00efve get broken apart in the output. Non-ASCII Latin characters split words incorrectly.",
    difficulty: 2,
    points: 10
  },
  {
    id: 40,
    title: "Lithuanian characters not handled",
    category: "Internationalization",
    inputTriggerable: true,
    triggerPattern: "Input contains Lithuanian special characters: \u0105, \u010d, \u0119, \u0117, \u012f, \u0161, \u0173, \u016b, \u017e",
    matchText: "Lithuanian text with special characters like \u0105 \u010d \u0119 \u0117 \u012f \u0161 \u0173 \u016b \u017e does not display or process correctly. The tool cannot handle Lithuanian language characters.",
    difficulty: 2,
    points: 10
  },
  {
    id: 41,
    title: "Japanese and CJK languages not handled",
    category: "Internationalization",
    inputTriggerable: true,
    triggerPattern: "Input contains CJK (Chinese, Japanese, Korean) characters or other non-Latin scripts like Arabic, Hebrew, Cyrillic",
    matchText: "Japanese Chinese Korean or other non-Latin text is not handled correctly. Characters from these languages are treated as separators and the word count is wrong. CJK text displays with strange spacing and incorrect counting.",
    difficulty: 2,
    points: 10
  },

  // ═══ NOT INPUT-TRIGGERABLE ═════════════════════════════════════════════════

  // ─── Action-Dependent ──────────────────────────────────────────────────────
  {
    id: 16,
    title: "Enter key behaves inconsistently",
    category: "Input Handling",
    inputTriggerable: false,
    matchText: "The Enter key behaves differently in different situations. Pressing Enter in the text area does not do what you would expect. Enter key behavior is inconsistent or confusing compared to clicking the button.",
    difficulty: 2,
    points: 10
  },
  {
    id: 17,
    title: "Enter key does not submit the form",
    category: "Input Handling",
    inputTriggerable: false,
    matchText: "Pressing Enter or Return does not submit the text for checking. The Enter key does not work as a keyboard shortcut to trigger the check. You must click the button with the mouse, Enter does nothing.",
    difficulty: 1,
    points: 5
  },
  {
    id: 18,
    title: "No clear or reset button",
    category: "Missing Feature",
    inputTriggerable: false,
    matchText: "There is no way to clear or reset the text field. No clear button or reset button exists. You have to manually select and delete all text to start over. Missing ability to reset the input.",
    difficulty: 1,
    points: 5
  },
  {
    id: 19,
    title: "Ctrl+R does not clear text in Firefox",
    category: "Browser Specific",
    inputTriggerable: false,
    matchText: "In Firefox the keyboard shortcut Ctrl+R does not clear the text field. Refreshing or reloading the page in Firefox does not reset the text area. The input persists after page refresh in Firefox browser.",
    difficulty: 3,
    points: 15
  },
  {
    id: 25,
    title: "Textarea resizable beyond viewport",
    category: "Layout",
    inputTriggerable: false,
    matchText: "The text input area can be resized by dragging and made bigger than the browser window. The textarea resize handle allows the user to drag it beyond the viewport boundaries. Unconstrained resizing of the text field.",
    difficulty: 2,
    points: 10
  },
  {
    id: 31,
    title: "Browser zoom breaks layout",
    category: "Responsive",
    inputTriggerable: false,
    matchText: "Zooming in or out in the browser breaks the page layout. When you change the zoom level the page becomes broken with missing scrollbars or elements overlapping. Browser zoom or resize causes layout problems.",
    difficulty: 2,
    points: 10
  },
  {
    id: 38,
    title: "No fallback when JavaScript is disabled",
    category: "Accessibility",
    inputTriggerable: false,
    matchText: "The application does not work at all when JavaScript is disabled. There is no message or fallback for users without JavaScript. Disabling JS shows a blank or non-functional page with no explanation.",
    difficulty: 3,
    points: 15
  },
  {
    id: 49,
    title: "Links open inconsistently",
    category: "Navigation",
    inputTriggerable: false,
    matchText: "Some links on the page open in a new window or tab while others open in the same window. The links behave inconsistently. Clicking different links gives different navigation behavior, some replace the page and some open new tabs.",
    difficulty: 2,
    points: 10
  },

  // ─── Observation / Inspection ──────────────────────────────────────────────
  {
    id: 22,
    title: "Output box not aligned with container",
    category: "Layout",
    inputTriggerable: false,
    matchText: "The grey output display area is not properly aligned. The output box has asymmetric margins or is offset from where it should be. The result area is not centered or aligned with the rest of the page.",
    difficulty: 2,
    points: 10
  },
  {
    id: 23,
    title: "Output positioned too far left",
    category: "Layout",
    inputTriggerable: false,
    matchText: "The output text or result area is positioned too far to the left side of the page. The alignment of the output is off, shifted left compared to the input area or page content.",
    difficulty: 2,
    points: 10
  },
  {
    id: 26,
    title: "Font inconsistency across the page",
    category: "Visual",
    inputTriggerable: false,
    matchText: "The page uses different fonts or typefaces in different areas. The heading uses one font style and the body text uses another. The font choices are inconsistent and reduce readability or look unprofessional. Mixed typefaces.",
    difficulty: 1,
    points: 5
  },
  {
    id: 28,
    title: "Text input positioned below output",
    category: "Layout",
    inputTriggerable: false,
    matchText: "The text input area appears below the output area which is unintuitive. Users expect to type first and see results below, but the layout has the result display above the input field. Unexpected or confusing positioning of input and output.",
    difficulty: 1,
    points: 5
  },
  {
    id: 29,
    title: "Landscape mobile view broken",
    category: "Responsive",
    inputTriggerable: false,
    matchText: "On a mobile phone in landscape or horizontal orientation the input field and button are not visible or are cut off. The app does not work properly when a mobile device is rotated to landscape mode.",
    difficulty: 2,
    points: 10
  },
  {
    id: 30,
    title: "Not responsive for mobile devices",
    category: "Responsive",
    inputTriggerable: false,
    matchText: "The application does not adapt to mobile screens. On a phone or small screen the layout is broken, too wide, or requires horizontal scrolling. The design is not responsive and has a fixed width that does not fit mobile devices.",
    difficulty: 1,
    points: 5
  },
  {
    id: 33,
    title: "Vertical scrolling blocked",
    category: "Layout",
    inputTriggerable: false,
    matchText: "The page does not scroll vertically or the scroll is broken. The button or parts of the content become inaccessible because you cannot scroll down to reach them. Vertical scrolling is disabled or not working.",
    difficulty: 2,
    points: 10
  },
  {
    id: 34,
    title: "Safari scroll bug persists until restart",
    category: "Browser Specific",
    inputTriggerable: false,
    matchText: "In Safari browser there is a scrolling bug that only goes away after restarting the browser. The scroll problem in Safari persists and cannot be fixed without a full browser restart.",
    difficulty: 3,
    points: 15
  },
  {
    id: 35,
    title: "Images missing alt text",
    category: "Accessibility",
    inputTriggerable: false,
    matchText: "Images on the page do not have alt text or alternative descriptions. The image tag is missing the alt attribute. Screen readers cannot describe the image content. Missing alternative text for accessibility.",
    difficulty: 1,
    points: 5
  },
  {
    id: 36,
    title: "Color contrast warnings",
    category: "Accessibility",
    inputTriggerable: false,
    matchText: "Accessibility tools or contrast checkers report color contrast issues. The colors used on the page do not meet accessibility standards or WCAG guidelines. There are contrast ratio warnings or failures.",
    difficulty: 2,
    points: 10
  },
  {
    id: 37,
    title: "Red and blue on grey fails contrast standards",
    category: "Accessibility",
    inputTriggerable: false,
    matchText: "The red and blue colored text on the grey background does not have enough contrast. The highlighted violation and warning text is hard to read against the grey output box. The color combination fails accessibility contrast requirements.",
    difficulty: 2,
    points: 10
  },
  {
    id: 42,
    title: "Color coding meaning is unclear",
    category: "UX",
    inputTriggerable: false,
    matchText: "The meaning of the colors used to highlight words is not explained. Red and blue text appears in the output but there is no legend or explanation of what each color means. Users cannot understand what the color coding represents.",
    difficulty: 1,
    points: 5
  },
  {
    id: 43,
    title: "Excessive whitespace in layout",
    category: "Layout",
    inputTriggerable: false,
    matchText: "The page has too much empty space or whitespace. The layout wastes a lot of available screen area. There are large gaps or unused blank areas on the page making it feel sparse or poorly laid out.",
    difficulty: 1,
    points: 5
  },
  {
    id: 44,
    title: "Instructions are unclear or insufficient",
    category: "UX",
    inputTriggerable: false,
    matchText: "The instructions or guidance on the page are unclear or not enough. It is hard to understand how to use the tool or what it does based on the text shown. The user guidance is insufficient, confusing, or missing important details.",
    difficulty: 1,
    points: 5
  },
  {
    id: 45,
    title: "Missing placeholder text in input field",
    category: "UX",
    inputTriggerable: false,
    matchText: "The text input area has no placeholder text or hint text. The textarea is completely blank with no suggestion of what to type. There should be example text or a hint to guide the user but the field is empty.",
    difficulty: 1,
    points: 5
  },
  {
    id: 46,
    title: "Inconsistent terminology",
    category: "UX",
    inputTriggerable: false,
    matchText: "The page uses inconsistent or confusing terminology. It says both discouraged words and violations which seem to mean different things but the distinction is unclear. The labels and terms used are not consistent throughout.",
    difficulty: 2,
    points: 10
  },
  {
    id: 47,
    title: "Page title and heading are awkward",
    category: "Content",
    inputTriggerable: false,
    matchText: "The page title or main heading text is awkwardly phrased or has grammar issues. The H1 heading does not match the browser tab title. The title text reads poorly or is missing punctuation.",
    difficulty: 1,
    points: 5
  },
  {
    id: 48,
    title: "License banner is too prominent",
    category: "Layout",
    inputTriggerable: false,
    matchText: "The license or attribution banner at the top of the page is too large and takes up too much space. The image or credit banner dominates the layout and pushes the actual tool content down. It should be smaller or in a footer.",
    difficulty: 1,
    points: 5
  },
  {
    id: 50,
    title: "URL structure exposes source code",
    category: "Security",
    inputTriggerable: false,
    matchText: "The URL structure of the application reveals or allows access to the source code files. You can navigate directly to the JavaScript file in the browser. The code is exposed and accessible through predictable URL paths.",
    difficulty: 2,
    points: 10
  },
  {
    id: 51,
    title: "External link missing security attributes",
    category: "Security",
    inputTriggerable: false,
    matchText: "Links that open in a new tab or window are missing noopener or noreferrer security attributes. The target blank link does not have proper rel attributes to prevent security issues like reverse tabnapping.",
    difficulty: 3,
    points: 15
  },
  {
    id: 52,
    title: "Favicon missing, returns 404",
    category: "Assets",
    inputTriggerable: false,
    matchText: "The website has no favicon. The browser tab shows no icon. The browser console shows a 404 error for favicon.ico. The site icon is missing.",
    difficulty: 1,
    points: 5
  },
  {
    id: 53,
    title: "security.txt file not present",
    category: "Security",
    inputTriggerable: false,
    matchText: "The site does not have a security.txt file. The well-known security contact information file is missing. There is no /.well-known/security.txt endpoint. The security reporting convention is not implemented.",
    difficulty: 3,
    points: 15
  },
  {
    id: 54,
    title: "License displayed as image not text",
    category: "Content",
    inputTriggerable: false,
    matchText: "The license or attribution information is shown as an image rather than selectable text. The credit is a picture that cannot be copied or read by screen readers. The attribution should be text not an image.",
    difficulty: 2,
    points: 10
  },
  {
    id: 55,
    title: "Large image impacts page load",
    category: "Performance",
    inputTriggerable: false,
    matchText: "The page loads slowly because of a large image. The banner or header image is too big and impacts loading performance. The image file size is excessive for its purpose and slows down the page.",
    difficulty: 2,
    points: 10
  },
  {
    id: 56,
    title: "CSS validation errors",
    category: "Code Quality",
    inputTriggerable: false,
    matchText: "The CSS stylesheet has validation errors. Running a CSS validator shows errors such as missing units on font-size values. The style sheet does not pass W3C CSS validation.",
    difficulty: 2,
    points: 10
  },
  {
    id: 57,
    title: "HTML validation errors",
    category: "Code Quality",
    inputTriggerable: false,
    matchText: "The HTML markup has validation errors. Running an HTML validator shows multiple issues. The page does not pass W3C HTML validation and has markup problems or missing attributes.",
    difficulty: 2,
    points: 10
  },
  {
    id: 58,
    title: "Inconsistent ID naming conventions",
    category: "Code Quality",
    inputTriggerable: false,
    matchText: "The HTML element IDs use inconsistent naming conventions. Some IDs use camelCase while others use different patterns. The code style for naming is not consistent throughout the source.",
    difficulty: 3,
    points: 15
  },
  {
    id: 59,
    title: "No privacy notice or policy",
    category: "Legal",
    inputTriggerable: false,
    matchText: "The application has no privacy notice or privacy policy. There is no information about how user data is handled or stored. A privacy policy page or statement is completely absent.",
    difficulty: 2,
    points: 10
  }
];

export const totalPoints = bugs.reduce((sum, b) => sum + b.points, 0);
export const totalBugs = bugs.length;
