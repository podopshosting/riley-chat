// Riley Chat Widget Loader
(function() {
    'use strict';

    // Get configuration from script tag
    const script = document.currentScript || document.querySelector('script[data-riley-config]');
    const configData = script ? script.getAttribute('data-riley-config') : null;

    let config = {
        apiUrl: 'https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod',
        companyName: 'Panda Exteriors',
        primaryColor: '#4F46E5',
        position: 'bottom-right',
        welcomeMessage: 'How can I help you with your roofing needs today?',
        showAvatar: true,
        soundNotifications: false
    };

    // Merge with custom config
    if (configData) {
        try {
            const customConfig = JSON.parse(configData);
            config = { ...config, ...customConfig };
        } catch (e) {
            console.error('Riley Widget: Invalid configuration', e);
        }
    }

    // Create widget container
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'riley-chat-widget-container';
    document.body.appendChild(widgetContainer);

    // Load widget HTML
    fetch('https://riley-dashboard-1754514173.s3.amazonaws.com/riley-chat-widget.html')
        .then(response => response.text())
        .then(html => {
            // Create a temporary container to parse the HTML
            const temp = document.createElement('div');
            temp.innerHTML = html;

            // Extract the widget div
            const widgetDiv = temp.querySelector('#riley-chat-widget');

            if (widgetDiv) {
                // Apply configuration
                if (config.position === 'bottom-left') {
                    widgetDiv.style.right = 'auto';
                    widgetDiv.style.left = '20px';
                }

                // Apply custom color
                widgetDiv.style.setProperty('--primary-color', config.primaryColor);

                // Update company name
                const headerText = widgetDiv.querySelector('.riley-header-text p');
                if (headerText) {
                    headerText.textContent = `Your ${config.companyName} assistant`;
                }

                // Append widget to container
                widgetContainer.appendChild(widgetDiv);

                // Extract and execute the script
                const scriptContent = temp.querySelector('script');
                if (scriptContent) {
                    const newScript = document.createElement('script');
                    newScript.textContent = scriptContent.textContent;
                    document.body.appendChild(newScript);
                }
            }
        })
        .catch(error => {
            console.error('Riley Widget: Failed to load', error);
        });

    // Global function to control widget
    window.RileyChat = {
        open: function() {
            const chatWindow = document.getElementById('rileyChatWindow');
            if (chatWindow) chatWindow.classList.add('show');
        },
        close: function() {
            const chatWindow = document.getElementById('rileyChatWindow');
            if (chatWindow) chatWindow.classList.remove('show');
        },
        setAppointment: function() {
            const banner = document.getElementById('rileyAppointmentBanner');
            if (banner) banner.classList.add('show');
        }
    };
})();