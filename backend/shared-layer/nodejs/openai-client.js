const https = require('https');
const secretsManager = require('./secrets-manager');

class OpenAIClient {
    constructor() {
        this.apiKey = null;
        this.model = 'gpt-4o-mini';
        this.maxTokens = 150;
        this.temperature = 0.7;
    }

    async getApiKey() {
        if (!this.apiKey) {
            const credentials = await secretsManager.getOpenAICredentials();
            this.apiKey = credentials.apiKey;
        }
        return this.apiKey;
    }

    async generateResponse(prompt, context = {}) {
        const requestBody = {
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: `You are Riley, a helpful AI assistant for ${context.companyName || 'Panda Exteriors'}.
                    ${context.personality || 'Be professional, friendly, and helpful.'}
                    ${context.companyDetails ? `Company info: ${JSON.stringify(context.companyDetails)}` : ''}
                    ${context.negativeFilters ? `Avoid these phrases: ${context.negativeFilters.join(', ')}` : ''}`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: this.maxTokens,
            temperature: this.temperature
        };

        if (context.threadHistory && context.threadHistory.length > 0) {
            // Add conversation history for context
            context.threadHistory.forEach(msg => {
                requestBody.messages.splice(1, 0, {
                    role: msg.role || 'assistant',
                    content: msg.content
                });
            });
        }

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.openai.com',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${await this.getApiKey()}`
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.error) {
                            reject(new Error(response.error.message));
                        } else if (response.choices && response.choices[0]) {
                            resolve(response.choices[0].message.content);
                        } else {
                            reject(new Error('Invalid response from OpenAI'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(JSON.stringify(requestBody));
            req.end();
        });
    }

    async analyzeIntent(message) {
        const prompt = `Analyze this customer message and determine the intent.
        Message: "${message}"

        Return a JSON object with:
        - intent: (booking, question, complaint, feedback, other)
        - sentiment: (positive, neutral, negative)
        - urgency: (low, medium, high)
        - suggestedAction: (brief suggestion for response)`;

        const response = await this.generateResponse(prompt);
        try {
            return JSON.parse(response);
        } catch {
            return {
                intent: 'other',
                sentiment: 'neutral',
                urgency: 'medium',
                suggestedAction: 'Provide general assistance'
            };
        }
    }

    async improveResponse(originalResponse, feedback) {
        const prompt = `Improve this customer service response based on feedback.
        Original response: "${originalResponse}"
        Feedback: "${feedback}"

        Generate an improved response that addresses the feedback while maintaining professionalism.`;

        return this.generateResponse(prompt);
    }
}

module.exports = new OpenAIClient();