let allResults = []; // Store all results for filtering

async function searchResearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    
    if (!query) return;

    // Show loading state
    showResultsTab();
    const resultsContainer = document.querySelector('#results .results-content');
    resultsContainer.innerHTML = `
        <div class="loading">
            <p style="color: #00ffff; font-size: 1.2rem;">
                Searching...
                <span class="loading-spinner"></span>
            </p>
        </div>
    `;

    try {
        const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        displayResults(data);
    } catch (error) {
        resultsContainer.innerHTML = `
            <div class="error-message">
                <h3>Error fetching results</h3>
                <p>${error.message || 'Failed to fetch results. Please try again.'}</p>
            </div>
        `;
    }
}

function displayResults(results) {
    const resultsContainer = document.querySelector('#results .results-content');
    resultsContainer.innerHTML = '';

    // Add results counter
    const resultsCount = `
        <div class="results-summary">
            <span class="results-count">
                Found ${results.length} research article${results.length !== 1 ? 's' : ''} 
                ${results.length > 0 ? 'related to your search' : ''}
            </span>
        </div>
    `;

    if (!results || results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="results-summary">
                <span class="results-count">No results found</span>
                <p class="no-results-message">Please try a different search term.</p>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = resultsCount;

    results.forEach(result => {
        const resultCard = createResultCard(result);
        resultsContainer.innerHTML += resultCard;
    });
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

function getSourceClass(source) {
    const sourceMap = {
        'arXiv': 'arxiv',
        'CORE': 'core',
        'PubMed': 'pubmed',
        'Europe PMC': 'europe-pmc',
        'DOAJ': 'doaj',
        'OpenAlex': 'openalex',
        'OpenCitations': 'opencitations',
        'SciELO': 'scielo',
        'Redalyc': 'redalyc'
    };
    return sourceMap[source] || '';
}

function filterResults(source) {
    if (source === 'all') {
        displayResults(allResults);
    } else {
        const filtered = allResults.filter(result => result.source === source);
        displayResults(filtered);
    }
}

function backToSearch() {
    document.getElementById('resultsTab').classList.remove('active');
    document.getElementById('searchTab').classList.add('active');
    document.getElementById("searchInput").value = '';
    document.getElementById("results").innerHTML = '';
}

function showResultsTab() {
    document.getElementById('searchTab').classList.remove('active');
    document.getElementById('resultsTab').classList.add('active');
}

function showSearchTab() {
    document.getElementById('resultsTab').classList.remove('active');
    document.getElementById('searchTab').classList.add('active');
}

// Add event listener for Enter key on search input
document.getElementById('searchInput').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        searchResearch();
    }
});

function createResultCard(result) {
    return `
        <div class="result-card" onclick="window.open('${result.link}', '_blank')">
            <div class="source-badge">${result.source}</div>
            <h3>${result.title}</h3>
            <p class="authors">${result.authors}</p>
            <p class="year">Year: ${result.year}</p>
            <p class="snippet">${result.snippet || ''}</p>
            <a href="${result.link}" 
               target="_blank" 
               class="view-paper"
               onclick="event.stopPropagation()">
                View Paper
            </a>
        </div>
    `;
}
