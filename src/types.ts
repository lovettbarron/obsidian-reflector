import { TFile } from "obsidian";

/**
 * Represents a meeting note - an H3 section under the configured "Notes" header
 * within a daily note file.
 */
export interface MeetingNote {
	/** The daily note file containing this meeting note */
	file: TFile;
	/** The H3 heading text (without the ### prefix) */
	heading: string;
	/** Line number where the H3 heading starts (0-indexed) */
	lineStart: number;
	/** Line number where the content ends (next H3 or section end) */
	lineEnd: number;
	/** Hashtags extracted from this section */
	tags: string[];
	/** Raw content of the section (excluding the heading line) */
	content: string;
	/** Date extracted from the daily note filename (YYYY-MM-DD) */
	date: string;
}

/**
 * Represents a TODO item found in the vault
 */
export interface TodoItem {
	/** The raw TODO text (without the checkbox) */
	text: string;
	/** The file containing this TODO */
	file: TFile;
	/** The heading under which this TODO appears (if any) */
	heading: string | null;
	/** Line number of the TODO */
	line: number;
}

/**
 * A TODO item with context about why it's related
 */
export interface RelatedTodoItem extends TodoItem {
	/** Why this TODO is related */
	relationReason: string;
	/** Tags that caused the match (if any) */
	matchingTags: string[];
}

/**
 * Represents a tag suggestion with its relevance score
 */
export interface TagSuggestion {
	/** The tag (including # prefix) */
	tag: string;
	/** Relevance score (higher = more relevant) */
	score: number;
	/** Reason for the suggestion */
	reason: string;
}
