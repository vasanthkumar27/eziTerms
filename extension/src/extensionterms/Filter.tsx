// filter.tsx
export function containsLegalContent(input: string): boolean {
    if (!input) return false;

    // Normalize input
    const normalized = input.toLowerCase();

    // Define keywords and phrases to look for
    const legalPhrases = [
        'terms and conditions',
        'privacy policy',
        'data protection',
        'user agreement',
        'cookie policy',
        'disclaimer',
        'legal notice',
        'acceptable use policy',
        'gdpr',
        'ccpa',
        'personal data',
        'third-party services',
        'consent to processing',
        'rights reserved',
        'intellectual property',
        'limitation of liability',
        'governing law',
        'jurisdiction',
        'compliance',
        'security policy',
        'refund policy',
        'return policy',
        'service terms',
        'end user license agreement',
        'eula',
        'opt-out',
        'opt-in'
    ];

    // Check if any phrase is present in the input
    return legalPhrases.some(phrase => normalized.includes(phrase));
}
