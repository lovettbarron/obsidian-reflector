import { App } from "obsidian";
import type { MeetingNote, TagSuggestion } from "../types";

export class TagService {
	constructor(private app: App) {}

	/**
	 * Get all tags used in the vault with their usage counts
	 */
	getAllVaultTags(): Map<string, number> {
		const tagCounts = new Map<string, number>();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.tags) {
				for (const tagCache of cache.tags) {
					const tag = tagCache.tag;
					tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
				}
			}
		}

		return tagCounts;
	}

	/**
	 * Get all unique tag names (without counts)
	 */
	getAllTagNames(): string[] {
		const tags = this.getAllVaultTags();
		return Array.from(tags.keys());
	}

	/**
	 * Suggest tags for a meeting note based on its title and content
	 */
	suggestTags(note: MeetingNote): TagSuggestion[] {
		const allTags = this.getAllTagNames();
		const suggestions: TagSuggestion[] = [];

		// Tokenize the heading and content
		const headingTokens = this.tokenize(note.heading);
		const contentTokens = this.tokenize(note.content);
		const allTokens = [...headingTokens, ...contentTokens];

		// Exclude tags already on this note
		const existingTags = new Set(note.tags.map((t) => t.toLowerCase()));

		for (const tag of allTags) {
			if (existingTags.has(tag.toLowerCase())) {
				continue;
			}

			const score = this.calculateTagScore(tag, headingTokens, contentTokens);
			if (score > 0) {
				suggestions.push({
					tag,
					score,
					reason: this.getMatchReason(tag, allTokens),
				});
			}
		}

		// Sort by score descending
		return suggestions.sort((a, b) => b.score - a.score).slice(0, 10);
	}

	private tokenize(text: string): string[] {
		// Convert to lowercase, split on non-alphanumeric, filter empty
		return text
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((t) => t.length > 2);
	}

	private calculateTagScore(
		tag: string,
		headingTokens: string[],
		contentTokens: string[]
	): number {
		// Remove # prefix and convert to lowercase for matching
		const tagName = tag.replace(/^#/, "").toLowerCase();
		const tagParts = tagName.split(/[/-]/);

		let score = 0;

		// Check heading matches (higher weight)
		for (const token of headingTokens) {
			if (tagName.includes(token) || token.includes(tagName)) {
				score += 10;
			}
			for (const part of tagParts) {
				if (part === token) {
					score += 15;
				} else if (part.includes(token) || token.includes(part)) {
					score += 5;
				}
			}
		}

		// Check content matches (lower weight)
		for (const token of contentTokens) {
			if (tagName.includes(token) || token.includes(tagName)) {
				score += 3;
			}
			for (const part of tagParts) {
				if (part === token) {
					score += 5;
				} else if (part.includes(token) || token.includes(part)) {
					score += 1;
				}
			}
		}

		return score;
	}

	private getMatchReason(tag: string, tokens: string[]): string {
		const tagName = tag.replace(/^#/, "").toLowerCase();
		const tagParts = tagName.split(/[/-]/);

		const matchingTokens: string[] = [];
		for (const token of tokens) {
			if (tagName.includes(token) || token.includes(tagName)) {
				matchingTokens.push(token);
			} else {
				for (const part of tagParts) {
					if (part === token || part.includes(token) || token.includes(part)) {
						matchingTokens.push(token);
						break;
					}
				}
			}
		}

		const unique = [...new Set(matchingTokens)].slice(0, 3);
		if (unique.length === 0) {
			return "Related";
		}
		return `Matches: ${unique.join(", ")}`;
	}
}
