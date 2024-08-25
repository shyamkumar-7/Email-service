function mockEmailProvider(name) {
    return async function (email) {
        if (Math.random() > 0.7) {
            throw new Error(`${name} failed to send email`);
        }
        console.log(`Email sent successfully via ${name}`);
        return { success: true, provider: name };
    };
}

class EmailService {
    constructor(options) {
        this.providers = options.providers || [];
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000; 
        this.rateLimit = options.rateLimit || 5; 
        this.timeWindow = options.timeWindow || 60000; 
        this.sentEmails = new Set(); 
        this.emailLog = []; 
        this.rateLimitCount = 0;
        this.rateLimitResetTime = Date.now();
    }

    async sendEmail(email) {
        const emailId = this.generateEmailId(email);
        
        if (this.sentEmails.has(emailId)) {
            console.log(`Duplicate email detected: ${emailId}`);
            return { success: false, error: "Duplicate email send attempt." };
        }

        if (!this.checkRateLimit()) {
            console.log(`Rate limit exceeded for email: ${emailId}`);
            return { success: false, error: "Rate limit exceeded." };
        }

        let result = null;
        let attempt = 0;
        let providerIndex = 0;

        while (attempt < this.maxRetries) {
            try {
                result = await this.providers[providerIndex](email);
                this.trackStatus(email, true, `Sent successfully using Provider ${providerIndex + 1}`);
                this.sentEmails.add(emailId);
                return result;
            } catch (error) {
                this.trackStatus(email, false, `Provider ${providerIndex + 1} failed: ${error.message}`);
                attempt++;

                if (attempt === this.maxRetries) {
                    providerIndex = (providerIndex + 1) % this.providers.length;
                    attempt = 0;
                    console.log(`Switching to next provider: Provider ${providerIndex + 1}`);
                }

                await this.exponentialBackoff(attempt);
            }
        }

        this.trackStatus(email, false, "All providers failed to send the email.");
        return { success: false, error: "All providers failed." };
    }

    async exponentialBackoff(attempt) {
        const delay = this.retryDelay * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    checkRateLimit() {
        const currentTime = Date.now();

        if (currentTime - this.rateLimitResetTime > this.timeWindow) {
            this.rateLimitCount = 0;
            this.rateLimitResetTime = currentTime;
        }

        if (this.rateLimitCount >= this.rateLimit) {
            return false;
        }

        this.rateLimitCount++;
        return true;
    }

    generateEmailId(email) {
        return `${email.to}-${email.subject}-${email.body}`;
    }

    trackStatus(email, success, message) {
        this.emailLog.push({
            email,
            success,
            message,
            timestamp: new Date()
        });
    }

    getEmailLog() {
        return this.emailLog;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const emailService = new EmailService({
        providers: [mockEmailProvider("Provider1"), mockEmailProvider("Provider2")],
        maxRetries: 3,
        retryDelay: 1000,
        rateLimit: 5,
        timeWindow: 60000
    });

    const emailForm = document.getElementById('emailForm');
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const to = document.getElementById('to').value;
        const subject = document.getElementById('subject').value;
        const body = document.getElementById('body').value;

        const email = { to, subject, body };
        const result = await emailService.sendEmail(email);

        document.getElementById('result').innerText = result.success ? "Email sent successfully!" : `Error: ${result.error}`;
        updateLog(emailService.getEmailLog());
    });

    function updateLog(log) {
        const logList = document.getElementById('logList');
        logList.innerHTML = '';

        log.forEach(entry => {
            const li = document.createElement('li');
            li.textContent = `${entry.timestamp.toLocaleString()}: ${entry.email.to} - ${entry.success ? "Success" : "Failure"} - ${entry.message}`;
            logList.appendChild(li);
        });
    }
});
