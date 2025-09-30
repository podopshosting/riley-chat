const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

class BusinessHoursHelper {
    constructor() {
        this.businessHours = null;
        this.timezone = 'America/New_York';
        this.afterHoursEnabled = true;
        this.afterHoursMessage = null;
    }

    async loadBusinessHours() {
        try {
            const result = await dynamodb.get({
                TableName: 'riley-settings',
                Key: { settingId: 'default' }
            }).promise();

            if (result.Item) {
                this.businessHours = result.Item.businessHours || this.getDefaultHours();
                this.timezone = result.Item.timezone || 'America/New_York';
                this.afterHoursEnabled = result.Item.afterHoursEnabled !== false;
                this.afterHoursMessage = result.Item.afterHoursMessage || this.getDefaultAfterHoursMessage();
            } else {
                this.businessHours = this.getDefaultHours();
                this.afterHoursMessage = this.getDefaultAfterHoursMessage();
            }
        } catch (error) {
            console.error('Error loading business hours:', error);
            this.businessHours = this.getDefaultHours();
            this.afterHoursMessage = this.getDefaultAfterHoursMessage();
        }
    }

    getDefaultHours() {
        return {
            sunday: { open: false, openTime: '08:00', closeTime: '18:00' },
            monday: { open: true, openTime: '08:00', closeTime: '18:00' },
            tuesday: { open: true, openTime: '08:00', closeTime: '18:00' },
            wednesday: { open: true, openTime: '08:00', closeTime: '18:00' },
            thursday: { open: true, openTime: '08:00', closeTime: '18:00' },
            friday: { open: true, openTime: '08:00', closeTime: '18:00' },
            saturday: { open: true, openTime: '09:00', closeTime: '16:00' }
        };
    }

    getDefaultAfterHoursMessage() {
        return "Thanks for reaching out! We are currently closed, but we wanted to confirm we received your message. We'll get back to you as soon as possible after we open at [[Next Open Time]].";
    }

    isBusinessHours() {
        if (!this.businessHours) {
            return true; // Default to open if not configured
        }

        const now = new Date(new Date().toLocaleString('en-US', { timeZone: this.timezone }));
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = dayNames[now.getDay()];
        const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

        const todayHours = this.businessHours[currentDay];

        if (!todayHours || !todayHours.open) {
            return false;
        }

        return currentTime >= todayHours.openTime && currentTime < todayHours.closeTime;
    }

    getNextOpenTime() {
        if (!this.businessHours) {
            return 'Monday at 8:00 AM';
        }

        const now = new Date(new Date().toLocaleString('en-US', { timeZone: this.timezone }));
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = now.getDay();
        const currentTime = now.toTimeString().slice(0, 5);

        // Check remaining days this week
        for (let i = 0; i < 7; i++) {
            const checkDay = (currentDay + i) % 7;
            const dayName = dayNames[checkDay];
            const dayHours = this.businessHours[dayName];

            if (dayHours && dayHours.open) {
                if (i === 0) {
                    // Today
                    if (currentTime < dayHours.openTime) {
                        return `today at ${this.formatTime(dayHours.openTime)}`;
                    }
                } else {
                    // Other days
                    const dayLabel = this.capitalize(dayName);
                    return `${dayLabel} at ${this.formatTime(dayHours.openTime)}`;
                }
            }
        }

        return 'our next business day';
    }

    formatTime(time24) {
        const [hours, minutes] = time24.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    getAfterHoursMessage(customerName = '') {
        if (!this.afterHoursEnabled) {
            return null;
        }

        let message = this.afterHoursMessage;
        const nextOpen = this.getNextOpenTime();

        // Replace variables
        message = message
            .replace(/\[\[Next Open Time\]\]/g, nextOpen)
            .replace(/\[\[Company Name\]\]/g, 'Panda Exteriors')
            .replace(/\[\[Customer Name\]\]/g, customerName);

        return message;
    }

    async shouldSendAfterHoursMessage() {
        await this.loadBusinessHours();
        return !this.isBusinessHours() && this.afterHoursEnabled;
    }
}

module.exports = new BusinessHoursHelper();