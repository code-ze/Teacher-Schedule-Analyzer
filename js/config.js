// Configuration and constants
const CONFIG = {
    // Working hours and days configuration
    WORK_HOURS: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
    WORK_DAYS: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
    
    // Full occupancy is 8am to 4pm (8 hours = 100%)
    FULL_OCCUPANCY_HOURS: 8, // 08:00 to 16:00
    
    // PDF settings
    PDF: {
        MARGIN: 20,
        PAGE_HEIGHT: 297, // A4 height in mm
        PAGE_WIDTH: 210,  // A4 width in mm
        BLOCK_WIDTH: 9,
        FONT_SIZES: {
            TITLE: 20,
            HEADER: 16,
            SUBHEADER: 12,
            BODY: 10,
            SMALL: 8,
            TINY: 6
        }
    }
};

// Utility functions
const UTILS = {
    extractClassId: function(courseName) {
        if (!courseName) return '';
        const m = String(courseName).match(/^[A-Z]{3,5}\d{3,4}/i);
        return m ? m[0].toUpperCase() : String(courseName).split(' ')[0];
    },

    showError: function(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;
        
        // Insert after upload section
        const uploadSection = document.querySelector('.upload-section');
        uploadSection.insertAdjacentElement('afterend', errorDiv);
        
        // Remove error after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    },

    showLoading: function() {
        const loadingSection = document.getElementById('loadingSection');
        const resultsSection = document.getElementById('resultsSection');
        loadingSection.style.display = 'block';
        resultsSection.style.display = 'none';
    },

    hideLoading: function() {
        const loadingSection = document.getElementById('loadingSection');
        loadingSection.style.display = 'none';
    }
};


