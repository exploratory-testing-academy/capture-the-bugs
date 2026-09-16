# Collecting some ideas of what could be in here

- A switch between production and test database to be implemented by some mechanism 
- input classification would do well classified to positive / negative tests of the application to encourage testing of actual usage flows over all the error handling an app could theoretically need.
- Time tracking: how long we thing coverage takes vs. how long the person took to do the assignment, and whether their results were following the "in the time used, most important testing got done" -heuristic
- add possibility for input: 
test cases as possibility to see how those change people's results
- bug report style impact to matching - So we need a way to Go through the list of bugs and come up with alternative ways of describing the problem, maybe even a list of keywords that increase the matching chances so that it works also if our description is long and the reporter's description is short, and the other way around. 
- teaching mode and evaluation mode - two different URLs so that in evaluation mode you don't get the hints. 

Bugs:
- "The UI is ugly" => 51% match to responsive ui

I found 2 instances for the fun of it:
1. If you type the same findings 1x then 2x times, you get extra score.
2. The model is too small and it is built around semantic search, so that means it also matches more than it should.

Examples for:
1. `There is no problem with the word count` -> This matches 5 points, when it shouldn't. But at this string 2 times as 2 findings and it matches 6 points. So this catches bugs #10,#11,#12,#13,#14 + #62 on the second finding
2. And the other is if you add this as 1 word per finding (18) you get 51% coverage: apostrophe, separated words, violations, contrast, whitespace, validation, decoded, quotes, context, possessive, newlines, font, ctrl, textarea, disabled, txt, digit, links open

I reported these but they weren't match: 
#7: In-app instructions on page are not as per common convention
#15: Wikipedia link: target="_blank" rel="nofollow" — missing noopener/noreferrer, a textbook reverse-tabnabbing gap.
#22: The app is missing a functionality to empty the fields
#25: bride-to-be should not be flagged as discouraged word