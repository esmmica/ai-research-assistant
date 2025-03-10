document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const resultsContainer = document.querySelector('#results .results-content');

    async function searchResearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        // Show loading state
        showResultsTab();
        resultsContainer.innerHTML = `
            <div class="loading">
                <p>Searching academic sources...</p>
            </div>
        `;

        try {
            const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            displayResults(data.results || []);
            updateSourceFilters(data.sources || []);
            
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
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="results-summary">
                    <span class="results-count">No results found</span>
                    <p class="no-results-message">Please try a different search term.</p>
                </div>
            `;
            return;
        }

        const resultsCount = `
            <div class="results-summary">
                <span class="results-count">
                    Found ${results.length} research article${results.length !== 1 ? 's' : ''} 
                    related to your search
                </span>
                <div id="sourceFilters" class="source-filters"></div>
            </div>
        `;

        const resultsGrid = document.createElement('div');
        resultsGrid.className = 'results-grid';
        
        results.forEach(result => {
            const resultCard = createResultCard(result);
            resultsGrid.innerHTML += resultCard;
        });

        resultsContainer.innerHTML = resultsCount;
        resultsContainer.appendChild(resultsGrid);
    }

    function updateSourceFilters(sources) {
        const filtersContainer = document.getElementById('sourceFilters');
        if (!filtersContainer) return;

        const allResults = Array.from(document.querySelectorAll('.result-card'));
        
        filtersContainer.innerHTML = `
            <button class="source-filter active" onclick="filterResults('all')">
                All Sources (${allResults.length})
            </button>
            ${sources.map(source => {
                const count = allResults.filter(card => 
                    card.querySelector('.source-badge').textContent === source
                ).length;
                return `
                    <button class="source-filter" onclick="filterResults('${source}')">
                        ${source} (${count})
                    </button>
                `;
            }).join('')}
        `;
    }

    function createResultCard(result) {
        const sourceClass = result.source.toLowerCase().replace(/\s+/g, '-');
        return `
            <div class="result-card" onclick="window.open('${result.link}', '_blank')">
                <div class="source-badge ${sourceClass}">${result.source}</div>
                <h3>${result.title || 'Untitled'}</h3>
                <p class="authors">${result.authors || 'Unknown Authors'}</p>
                ${result.year ? `<p class="year">Year: ${result.year}</p>` : ''}
                ${result.snippet ? `<p class="snippet">${truncateText(result.snippet, 200)}</p>` : ''}
                <a href="${result.link}" 
                   target="_blank" 
                   class="view-paper"
                   onclick="event.stopPropagation()">
                    View Paper
                </a>
            </div>
        `;
    }

    function truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
    }

    // Event Listeners
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            searchResearch();
        }
    });

    // Make functions globally available
    window.searchResearch = searchResearch;
    window.filterResults = (source) => {
        const filterButtons = document.querySelectorAll('.source-filter');
        filterButtons.forEach(button => {
            button.classList.toggle('active', 
                source === 'all' ? button.textContent.includes('All Sources') : 
                button.textContent.includes(source)
            );
        });

        const cards = document.querySelectorAll('.result-card');
        cards.forEach(card => {
            const cardSource = card.querySelector('.source-badge').textContent;
            card.style.display = (source === 'all' || cardSource === source) ? 'block' : 'none';
        });
    };
    window.showResultsTab = () => {
        document.getElementById('searchTab').classList.remove('active');
        document.getElementById('resultsTab').classList.add('active');
    };
    window.showSearchTab = () => {
        document.getElementById('resultsTab').classList.remove('active');
        document.getElementById('searchTab').classList.add('active');
        searchInput.value = '';
        resultsContainer.innerHTML = '';
    };
});
