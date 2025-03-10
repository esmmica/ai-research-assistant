const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const path = require("path");
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper function to scrape Google Scholar
async function searchGoogleScholar(query) {
    try {
        const response = await axios.get(`https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`);
        // Process and return results
        // Note: Google Scholar might have restrictions on scraping
    } catch (error) {
        console.error('Google Scholar search error:', error);
        return [];
    }
}

// Helper function to search ResearchGate
async function searchResearchGate(query) {
    try {
        const searchUrl = `https://www.researchgate.net/search/publication?q=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const results = [];

        $('.search-results-item').each((i, element) => {
            results.push({
                title: $(element).find('.publication-title').text().trim(),
                link: 'https://www.researchgate.net' + $(element).find('a').attr('href'),
                authors: $(element).find('.authors').text().trim(),
                snippet: $(element).find('.publication-abstract').text().trim(),
                source: 'ResearchGate'
            });
        });

        return results;
    } catch (error) {
        console.error('ResearchGate error:', error);
        return [];
    }
}

// Semantic Scholar API
async function searchSemanticScholar(query) {
    try {
        const response = await axios.get(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}`);
        // Process and return results
        return [];
    } catch (error) {
        console.error('Semantic Scholar search error:', error);
        return [];
    }
}

// PubMed API (no API key needed)
async function searchPubMed(query) {
    try {
        // First, search for IDs
        const searchResponse = await axios.get(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi`,
            {
                params: {
                    db: 'pubmed',
                    term: query,
                    retmax: 10,
                    format: 'json'
                }
            }
        );

        const ids = searchResponse.data.esearchresult.idlist;

        // Then fetch details for these IDs
        const detailsResponse = await axios.get(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi`,
            {
                params: {
                    db: 'pubmed',
                    id: ids.join(','),
                    format: 'json'
                }
            }
        );

        return Object.values(detailsResponse.data.result)
            .filter(item => item.uid)
            .map(paper => ({
                title: paper.title,
                authors: paper.authors?.map(a => a.name).join(', '),
                link: `https://pubmed.ncbi.nlm.nih.gov/${paper.uid}`,
                year: paper.pubdate?.substring(0, 4),
                snippet: paper.abstract,
                source: 'PubMed'
            }));
    } catch (error) {
        console.error('PubMed error:', error);
        return [];
    }
}

// Europe PMC (no API key needed)
async function searchEuropePMC(query) {
    try {
        const response = await axios.get(
            `https://www.ebi.ac.uk/europepmc/webservices/rest/search`,
            {
                params: {
                    query: query,
                    format: 'json',
                    pageSize: 10
                }
            }
        );

        return response.data.resultList.result.map(paper => ({
            title: paper.title,
            authors: paper.authorString,
            link: `https://europepmc.org/article/${paper.source}/${paper.id}`,
            year: paper.pubYear,
            snippet: paper.abstractText,
            source: 'Europe PMC'
        }));
    } catch (error) {
        console.error('Europe PMC error:', error);
        return [];
    }
}

// arXiv API (no API key needed)
async function searchArxiv(query) {
    try {
        const response = await axios.get(`http://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&max_results=10`);
        const results = await parseArxivResults(response.data);
        return results;
    } catch (error) {
        console.error('arXiv search error:', error);
        return [];
    }
}

// CORE API (using your existing API key)
async function searchCore(query) {
    const CORE_API_KEY = process.env.CORE_API_KEY;
    try {
        const response = await axios.get(
            'https://api.core.ac.uk/v3/search/works',
            {
                params: {
                    q: query,
                    limit: 10
                },
                headers: {
                    'Authorization': `Bearer ${CORE_API_KEY}`
                }
            }
        );

        return response.data.results.map(paper => ({
            title: paper.title || 'Untitled',
            authors: paper.authors?.join(', ') || 'Unknown Authors',
            link: paper.downloadUrl || paper.sourceFulltextUrl || 
                  (paper.doi ? `https://doi.org/${paper.doi}` : '#'),
            year: paper.yearPublished,
            snippet: paper.abstract || 'No abstract available',
            source: 'CORE'
        }));
    } catch (error) {
        console.error('CORE error:', error);
        return [];
    }
}

// OpenCitations API
async function searchOpenCitations(query) {
    try {
        // First get DOIs from OpenAlex to search in OpenCitations
        const alexResponse = await axios.get(
            `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=5`
        );

        const dois = alexResponse.data.results
            .filter(paper => paper.doi)
            .map(paper => paper.doi);

        // Get citations for each DOI
        const citationsPromises = dois.map(async (doi) => {
            const response = await axios.get(
                `https://opencitations.net/index/api/v1/citations/${doi}`
            );
            return response.data;
        });

        const citationsResults = await Promise.all(citationsPromises);
        return citationsResults.flat().map(citation => ({
            title: citation.citing_title,
            authors: citation.citing_authors,
            link: `https://doi.org/${citation.citing}`,
            year: citation.year,
            source: 'OpenCitations'
        }));
    } catch (error) {
        console.error('OpenCitations error:', error);
        return [];
    }
}

// Dataverse API
async function searchDataverse(query) {
    try {
        const response = await axios.get(
            `https://demo.dataverse.org/api/search`,
            {
                params: {
                    q: query,
                    type: 'dataset',
                    per_page: 10
                }
            }
        );

        return response.data.data.items.map(dataset => ({
            title: dataset.name,
            authors: dataset.authors?.map(a => a.name).join(', '),
            link: dataset.url,
            year: new Date(dataset.published_at).getFullYear(),
            snippet: dataset.description,
            source: 'Dataverse'
        }));
    } catch (error) {
        console.error('Dataverse error:', error);
        return [];
    }
}

// Google Books API
async function searchGoogleBooks(query) {
    const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY; // Add your API key to .env
    try {
        const response = await axios.get(
            `https://www.googleapis.com/books/v1/volumes`,
            {
                params: {
                    q: query,
                    key: GOOGLE_BOOKS_API_KEY,
                    maxResults: 10
                }
            }
        );

        return response.data.items.map(book => ({
            title: book.volumeInfo.title,
            authors: book.volumeInfo.authors?.join(', ') || 'Unknown Authors',
            link: book.volumeInfo.infoLink,
            year: book.volumeInfo.publishedDate?.substring(0, 4),
            snippet: book.volumeInfo.description,
            source: 'Google Books'
        }));
    } catch (error) {
        console.error('Google Books error:', error);
        return [];
    }
}

// DOAJ (Directory of Open Access Journals) - Completely Free
async function searchDOAJ(query) {
    try {
        const response = await axios.get(`https://doaj.org/api/v2/search/articles/${encodeURIComponent(query)}`);
        const results = response.data.results.map(item => ({
            title: item.bibjson.title,
            authors: item.bibjson.author?.map(a => a.name).join(', ') || 'Unknown',
            year: item.bibjson.year || 'N/A',
            link: item.bibjson.link?.[0]?.url || '#',
            source: 'DOAJ',
            snippet: item.bibjson.abstract || ''
        }));
        return results;
    } catch (error) {
        console.error('DOAJ search error:', error);
        return [];
    }
}

// BASE (Bielefeld Academic Search Engine) - Completely Free
async function searchBASE(query) {
    try {
        const response = await axios.get(
            `https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi`,
            {
                params: {
                    func: 'PerformSearch',
                    query: query,
                    format: 'json',
                    hits: 10
                }
            }
        );

        return response.data.response.docs.map(paper => ({
            title: paper.dctitle,
            authors: paper.dccontributor?.join(', '),
            link: paper.dcidentifier,
            year: paper.dcyear,
            snippet: paper.dcdescription,
            source: 'BASE'
        }));
    } catch (error) {
        console.error('BASE error:', error);
        return [];
    }
}

// OpenAlex API
async function searchOpenAlex(query) {
    try {
        const response = await axios.get(
            `https://api.openalex.org/works`,
            {
                params: {
                    search: query,
                    per_page: 10
                },
                headers: {
                    'Accept': 'application/json',
                    // Add your email for better support (optional)
                    'User-Agent': 'ResearchFinder/1.0 (your@email.com)'
                }
            }
        );

        return response.data.results.map(paper => ({
            title: paper.title,
            authors: paper.authorships?.map(a => a.author.display_name).join(', '),
            link: paper.doi ? `https://doi.org/${paper.doi}` : paper.primary_location?.landing_page_url,
            year: paper.publication_year,
            snippet: paper.abstract,
            source: 'OpenAlex'
        }));
    } catch (error) {
        console.error('OpenAlex error:', error);
        return [];
    }
}

// SciELO API
async function searchSciELO(query) {
    try {
        const response = await axios.get(
            `https://search.scielo.org/`,
            {
                params: {
                    q: query,
                    format: 'json',
                    count: 10
                }
            }
        );

        return response.data.map(paper => ({
            title: paper.title,
            authors: paper.authors,
            link: paper.url,
            year: paper.year,
            snippet: paper.abstract,
            source: 'SciELO'
        }));
    } catch (error) {
        console.error('SciELO error:', error);
        return [];
    }
}

// Redalyc API
async function searchRedalyc(query) {
    try {
        const response = await axios.get(
            `https://www.redalyc.org/service/r2020/getData`,
            {
                params: {
                    type: 'search',
                    query: query,
                    limit: 10
                }
            }
        );

        return response.data.map(paper => ({
            title: paper.title,
            authors: paper.authors,
            link: `https://www.redalyc.org/articulo.oa?id=${paper.id}`,
            year: paper.year,
            snippet: paper.abstract,
            source: 'Redalyc'
        }));
    } catch (error) {
        console.error('Redalyc error:', error);
        return [];
    }
}

// Add these new search functions
async function searchPMC(query) {
    try {
        const response = await axios.get(`https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?tool=my_tool&email=my_email@example.com&ids=${encodeURIComponent(query)}`);
        // Process and return results
        return [];
    } catch (error) {
        console.error('PMC search error:', error);
        return [];
    }
}

async function searchERIC(query) {
    try {
        const response = await axios.get(`https://api.ies.ed.gov/eric/?search=${encodeURIComponent(query)}&format=json`);
        const results = response.data.response.docs.map(item => ({
            title: item.title,
            authors: item.author || 'Unknown',
            year: item.publicationDateTime?.split('-')[0] || 'N/A',
            link: item.url,
            source: 'ERIC',
            snippet: item.description || ''
        }));
        return results;
    } catch (error) {
        console.error('ERIC search error:', error);
        return [];
    }
}

async function searchPLOS(query) {
    try {
        const response = await axios.get(`https://api.plos.org/search?q=${encodeURIComponent(query)}`);
        // Process and return results
        return [];
    } catch (error) {
        console.error('PLOS search error:', error);
        return [];
    }
}

// Update the main search endpoint
app.get("/search", async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        // Fetch results from all sources in parallel
        const results = await Promise.all([
            searchArxiv(query),
            searchDOAJ(query),
            searchERIC(query),
            searchPMC(query),
            // Add more sources here
        ]);

        // Combine and remove duplicates
        const combinedResults = results
            .flat()
            .filter(Boolean)
            .filter((result, index, self) => 
                index === self.findIndex(r => r.title === result.title)
            );

        // Sort by year (newest first)
        combinedResults.sort((a, b) => {
            const yearA = parseInt(a.year) || 0;
            const yearB = parseInt(b.year) || 0;
            return yearB - yearA;
        });

        res.json(combinedResults);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
