const AWS = require('aws-sdk');
const trainingScripts = require('./training-scripts.json');

// Initialize AWS services
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Enhanced AI Response Generator with Training Scripts
class RileyAI {
    constructor() {
        this.scripts = trainingScripts;
        this.conversationContext = {};
    }

    // Main response generation method
    async generateResponse(message, phoneNumber, context = {}) {
        const analysis = this.analyzeMessage(message);
        const customerContext = await this.getCustomerContext(phoneNumber);

        // Select appropriate response based on analysis
        let response = this.selectBestResponse(analysis, customerContext);

        // Personalize the response
        response = this.personalizeResponse(response, customerContext);

        // Store conversation for learning
        await this.storeConversation(phoneNumber, message, response, analysis);

        return response;
    }

    // Analyze incoming message
    analyzeMessage(message) {
        const lower = message.toLowerCase();
        const analysis = {
            intent: this.detectIntent(lower),
            sentiment: this.analyzeSentiment(lower),
            urgency: this.detectUrgency(lower),
            service: this.detectService(lower),
            keywords: this.extractKeywords(lower),
            hasQuestion: this.isQuestion(lower)
        };

        return analysis;
    }

    // Detect customer intent
    detectIntent(message) {
        const intents = {
            appointment: ['appointment', 'schedule', 'book', 'inspection', 'estimate', 'confirm', 'reschedule'],
            service_inquiry: ['roof', 'siding', 'window', 'gutter', 'repair', 'replace', 'fix'],
            pricing: ['price', 'cost', 'quote', 'estimate', 'how much', 'afford', 'payment'],
            emergency: ['urgent', 'emergency', 'leak', 'damage', 'asap', 'immediately', 'today'],
            followup: ['status', 'update', 'when', 'follow up', 'check', 'progress'],
            complaint: ['unhappy', 'problem', 'issue', 'wrong', 'mistake', 'bad'],
            confirmation: ['yes', 'confirm', 'agree', 'ok', 'sure', 'sounds good'],
            cancellation: ['cancel', 'stop', 'no', 'not interested', 'remove']
        };

        for (const [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(keyword => message.includes(keyword))) {
                return intent;
            }
        }

        return 'general';
    }

    // Detect service type
    detectService(message) {
        const services = {
            roofing: ['roof', 'shingle', 'tile', 'flat roof', 'metal roof'],
            siding: ['siding', 'vinyl', 'hardie', 'wood siding', 'fiber cement'],
            windows: ['window', 'glass', 'double pane', 'replacement window'],
            gutters: ['gutter', 'downspout', 'drainage', 'leaf guard']
        };

        for (const [service, keywords] of Object.entries(services)) {
            if (keywords.some(keyword => message.includes(keyword))) {
                return service;
            }
        }

        return null;
    }

    // Detect urgency level
    detectUrgency(message) {
        const urgentWords = ['urgent', 'emergency', 'asap', 'immediately', 'today', 'leak', 'damage', 'storm'];
        const urgencyScore = urgentWords.filter(word => message.includes(word)).length;

        if (urgencyScore >= 2) return 'high';
        if (urgencyScore === 1) return 'medium';
        return 'low';
    }

    // Analyze sentiment
    analyzeSentiment(message) {
        const positive = ['yes', 'great', 'good', 'perfect', 'excellent', 'thanks', 'appreciate', 'happy'];
        const negative = ['no', 'bad', 'terrible', 'angry', 'upset', 'disappointed', 'unhappy', 'problem'];

        const positiveCount = positive.filter(word => message.includes(word)).length;
        const negativeCount = negative.filter(word => message.includes(word)).length;

        if (positiveCount > negativeCount) return 'positive';
        if (negativeCount > positiveCount) return 'negative';
        return 'neutral';
    }

    // Check if message is a question
    isQuestion(message) {
        return message.includes('?') ||
               ['how', 'what', 'when', 'where', 'why', 'can', 'could', 'would', 'should'].some(word =>
                   message.startsWith(word) || message.includes(' ' + word + ' '));
    }

    // Extract keywords
    extractKeywords(message) {
        const stopWords = ['the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are', 'was', 'were'];
        const words = message.split(/\s+/).filter(word =>
            word.length > 2 && !stopWords.includes(word)
        );
        return words;
    }

    // Select the best response based on analysis
    selectBestResponse(analysis, context) {
        const { intent, urgency, service, sentiment } = analysis;

        // Handle emergency situations first
        if (urgency === 'high' || intent === 'emergency') {
            return this.scripts.special_situations.storm_response.template;
        }

        // Handle appointments
        if (intent === 'appointment') {
            if (context.hasAppointment) {
                return this.scripts.appointment_confirmation.initial.template;
            }
            return this.scripts.lead_qualification.initial_interest.template;
        }

        // Handle service inquiries
        if (intent === 'service_inquiry' && service) {
            return this.scripts.service_specific[service]?.template ||
                   this.scripts.service_specific.roofing.template;
        }

        // Handle pricing inquiries
        if (intent === 'pricing') {
            if (sentiment === 'negative') {
                return this.scripts.objection_handling.price_concern.template;
            }
            return this.scripts.lead_qualification.initial_interest.template;
        }

        // Handle follow-ups
        if (intent === 'followup') {
            if (context.hasRecentInspection) {
                return this.scripts.follow_up.after_inspection.template;
            }
            if (context.hasQuote) {
                return this.scripts.follow_up.quote_follow_up.template;
            }
        }

        // Handle confirmations
        if (intent === 'confirmation') {
            return "Great! I've confirmed that for you. You'll receive a confirmation text shortly with all the details.";
        }

        // Handle cancellations
        if (intent === 'cancellation') {
            return "I understand. I've noted your request. If you change your mind or need our services in the future, we're just a text away. Thank you!";
        }

        // Default response
        return "Hi! I'm Riley from Panda Exteriors. I can help you with roofing, siding, windows, and gutter services. How can I assist you today?";
    }

    // Personalize response with customer data
    personalizeResponse(template, context) {
        let response = template;

        // Replace variables with actual data
        const replacements = {
            '{customer_name}': context.name || 'there',
            '{service_type}': context.serviceType || 'home exterior',
            '{date}': context.appointmentDate || 'TBD',
            '{time}': context.appointmentTime || 'TBD',
            '{specialist_name}': context.specialistName || 'our specialist',
            '{address}': context.address || 'your property',
            '{eta_minutes}': '30'
        };

        for (const [variable, value] of Object.entries(replacements)) {
            response = response.replace(new RegExp(variable, 'g'), value);
        }

        return response;
    }

    // Get customer context from database
    async getCustomerContext(phoneNumber) {
        try {
            const result = await dynamodb.get({
                TableName: 'riley-customers',
                Key: { phoneNumber }
            }).promise();

            return result.Item || {
                phoneNumber,
                isNewCustomer: true
            };
        } catch (error) {
            console.log('Customer context not found, treating as new customer');
            return {
                phoneNumber,
                isNewCustomer: true
            };
        }
    }

    // Store conversation for learning and analytics
    async storeConversation(phoneNumber, message, response, analysis) {
        const conversation = {
            id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            phoneNumber,
            message,
            response,
            analysis,
            timestamp: new Date().toISOString()
        };

        try {
            await dynamodb.put({
                TableName: 'riley-conversations',
                Item: conversation
            }).promise();
        } catch (error) {
            console.error('Error storing conversation:', error);
        }
    }

    // Learn from feedback
    async learnFromFeedback(conversationId, feedback) {
        try {
            await dynamodb.update({
                TableName: 'riley-conversations',
                Key: { id: conversationId },
                UpdateExpression: 'SET feedback = :feedback, feedbackTimestamp = :timestamp',
                ExpressionAttributeValues: {
                    ':feedback': feedback,
                    ':timestamp': new Date().toISOString()
                }
            }).promise();

            // Analyze feedback patterns for continuous improvement
            if (feedback.rating < 3) {
                console.log('Negative feedback received, flagging for review:', conversationId);
                // TODO: Implement learning algorithm to improve responses
            }
        } catch (error) {
            console.error('Error storing feedback:', error);
        }
    }
}

// Export the AI module
module.exports = RileyAI;