The repository you have access to here is an example template for an obsidian.md plugin. Take a look at this repo and online documentation to understand the obsidian API and what the plugin is capable of.

I want to make an obsidian plugin that does a few tasks:

-   That help me review notes and identify notes that arne't tagged with a hashtag based tagging system, which is how different tags are identified
-   That suggests tags based on the H3 note title
-   That populates a reverse chronological list of associated notes with the currently selected meeting note (i.e. H3 note where the cursor currently exists) in the righthand sidebar
-   Populates any open TODO items that are connected to notes associated with the current note

Reviewing notes: I want to review daily notes (which are .md files stored in a toplevel obsidian directory called \_daily with a format of YYYY-MM-DD.md), and find any meeting notes (H3 tagged items) under the "H2 Notes" heading.

Once those notes are identified, I want any notes that do not have tags to be selected, and listed in the sidebar panel under an "untagged notes" list. I want to be able to select one of those notes, which should take me to the selected markdown file so I can add tags.

Suggesting tags: Any time a new meeting note is created with an H3 tag, I would like to get tags recommended to me based on related notes and their associated tags. This should select from the existing list of tags within the obsidian vault.

Populating relevant lists: This should populated related notes to the current selected note. Tags should be the primary matching mechanism for this. This feature should be architected so additional features can be added in the future.

TODO items: Any incomplete todo items (markdown is [ ]) that have a connection to an associated note should be listed at the top of the sidebar item. The todo item should be in the format of markdown todo line (markdown_file_name.md -> H3 Header name)

Please make some suggestions the project is well structured so that the code is human readable and modifiable.

When structuring this project, create an architecture that emphasizes the object of "Meeting note" which is the content under an H3 tag, that exists under the H2 "Notes" item.

Ensure that the obsidian plugin has certain configuration features common to a community plugin. This should include:

-   The ability to change the folder where the daily note files live, with a default of \_daily
-   The ability to change the meeting note header of with a default of ## Notes

Let's get started on this project! If you have suggestions on how to improve this prompt, please include those.
