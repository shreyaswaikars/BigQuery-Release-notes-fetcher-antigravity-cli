document.addEventListener('DOMContentLoaded', () => {
    // State management
    let allUpdates = [];
    let selectedUpdateIds = new Set();
    let activeFilters = {
        search: '',
        type: 'all'
    };

    // DOM Elements
    const updatesList = document.getElementById('updates-list');
    const refreshBtn = document.getElementById('refresh-btn');
    const searchInput = document.getElementById('search-input');
    const typeFilter = document.getElementById('type-filter');
    const bulkActionBar = document.getElementById('bulk-action-bar');
    const selectedCountSpan = document.getElementById('selected-count');
    const bulkTweetBtn = document.getElementById('bulk-tweet-btn');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    
    // Modal Elements
    const tweetModalOverlay = document.getElementById('tweet-modal-overlay');
    const modalClose = document.getElementById('modal-close');
    const tweetTextarea = document.getElementById('tweet-textarea');
    const charCounter = document.getElementById('char-counter');
    const confirmTweetBtn = document.getElementById('confirm-tweet-btn');
    let currentComposerText = '';

    // Initialize Application
    fetchUpdates();

    // Event Listeners
    refreshBtn.addEventListener('click', () => fetchUpdates(true));
    searchInput.addEventListener('input', (e) => {
        activeFilters.search = e.target.value.toLowerCase().trim();
        renderUpdates();
    });
    typeFilter.addEventListener('change', (e) => {
        activeFilters.type = e.target.value;
        renderUpdates();
    });

    // Bulk action handlers
    clearSelectionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedUpdateIds.clear();
        updateBulkBar();
        document.querySelectorAll('.update-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
    });

    bulkTweetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedUpdateIds.size === 0) return;
        
        // Combine text from selected updates
        const selectedUpdates = allUpdates.filter(u => selectedUpdateIds.has(u.id));
        let tweetText = '';
        
        if (selectedUpdates.length === 1) {
            tweetText = generateTweetText(selectedUpdates[0]);
        } else {
            // Summary tweet for multiple selections
            const dates = [...new Set(selectedUpdates.map(u => u.date))];
            const types = [...new Set(selectedUpdates.map(u => u.type))];
            tweetText = `Multiple BigQuery Updates (${dates.join(', ')}):\n`;
            
            selectedUpdates.forEach((u, i) => {
                const bullet = `• [${u.type}] ${u.text}`;
                if ((tweetText + bullet).length < 240) {
                    tweetText += bullet + '\n';
                }
            });
            
            tweetText += `\nRead details: https://cloud.google.com/bigquery/docs/release-notes #BigQuery`;
        }
        
        openTweetComposer(tweetText);
    });

    // Modal Close
    modalClose.addEventListener('click', closeTweetComposer);
    tweetModalOverlay.addEventListener('click', (e) => {
        if (e.target === tweetModalOverlay) {
            closeTweetComposer();
        }
    });

    // Character Counter
    tweetTextarea.addEventListener('input', (e) => {
        const count = e.target.value.length;
        charCounter.textContent = `${count} / 280`;
        
        if (count > 280) {
            charCounter.className = 'char-counter danger';
            confirmTweetBtn.disabled = true;
        } else if (count > 250) {
            charCounter.className = 'char-counter warning';
            confirmTweetBtn.disabled = false;
        } else {
            charCounter.className = 'char-counter';
            confirmTweetBtn.disabled = false;
        }
    });

    // Trigger Twitter Intent
    confirmTweetBtn.addEventListener('click', () => {
        const text = encodeURIComponent(tweetTextarea.value);
        const url = `https://twitter.com/intent/tweet?text=${text}`;
        window.open(url, '_blank', 'width=550,height=420');
        closeTweetComposer();
        showToast("Twitter intent opened!");
    });

    // Functions
    async function fetchUpdates(force = false) {
        setLoadingState(true);
        selectedUpdateIds.clear();
        updateBulkBar();
        
        try {
            const url = force ? '/api/updates?force=true' : '/api/updates';
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            allUpdates = data.updates || [];
            
            // Populate types filter with unique types present in the feed
            populateTypeFilters(allUpdates);
            
            renderUpdates();
            
            if (force) {
                showToast("Release notes refreshed!");
            }
        } catch (error) {
            console.error('Error fetching updates:', error);
            showErrorState(error.message);
        } finally {
            setLoadingState(false);
        }
    }

    function populateTypeFilters(updates) {
        const currentType = typeFilter.value;
        const types = new Set(updates.map(u => u.type));
        
        // Reset typeFilter HTML but preserve 'All'
        typeFilter.innerHTML = '<option value="all">All Categories</option>';
        
        // Sort and add types
        Array.from(types).sort().forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeFilter.appendChild(option);
        });
        
        // Restore selection if still exists
        if (types.has(currentType)) {
            typeFilter.value = currentType;
        } else {
            typeFilter.value = 'all';
            activeFilters.type = 'all';
        }
    }

    function renderUpdates() {
        updatesList.innerHTML = '';
        
        const filtered = allUpdates.filter(u => {
            const matchesSearch = u.text.toLowerCase().includes(activeFilters.search) || 
                                  u.date.toLowerCase().includes(activeFilters.search) ||
                                  u.type.toLowerCase().includes(activeFilters.search);
            const matchesType = activeFilters.type === 'all' || u.type === activeFilters.type;
            return matchesSearch && matchesType;
        });

        if (filtered.length === 0) {
            renderEmptyState();
            return;
        }

        filtered.forEach(update => {
            const card = document.createElement('div');
            card.className = `update-card ${selectedUpdateIds.has(update.id) ? 'selected' : ''}`;
            card.dataset.id = update.id;
            card.dataset.type = update.type;
            
            // Format HTML badges
            let badgeClass = 'badge-general';
            const typeLower = update.type.toLowerCase();
            if (typeLower.includes('feature')) badgeClass = 'badge-feature';
            else if (typeLower.includes('announcement')) badgeClass = 'badge-announcement';
            else if (typeLower.includes('issue')) badgeClass = 'badge-issue';
            else if (typeLower.includes('change')) badgeClass = 'badge-change';
            else if (typeLower.includes('breaking')) badgeClass = 'badge-breaking';

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-meta">
                        <span class="badge ${badgeClass}">${update.type}</span>
                        <span class="card-date">${update.date}</span>
                    </div>
                    <div class="card-actions">
                        <button class="action-btn tweet-btn" title="Tweet this update" data-id="${update.id}">
                            <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
                            </svg>
                        </button>
                        <button class="action-btn copy-btn" title="Copy text" data-id="${update.id}">
                            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    ${update.html}
                </div>
            `;

            // Card click listener (for selection)
            card.addEventListener('click', (e) => {
                // If clicked an action button or link, don't trigger select
                if (e.target.closest('.action-btn') || e.target.closest('a')) return;
                
                toggleCardSelection(update.id, card);
            });

            // Tweet button listener
            card.querySelector('.tweet-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const tweetText = generateTweetText(update);
                openTweetComposer(tweetText);
            });

            // Copy button listener
            card.querySelector('.copy-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(update.text).then(() => {
                    showToast("Text copied to clipboard!");
                }).catch(err => {
                    console.error('Error copying text:', err);
                });
            });

            updatesList.appendChild(card);
        });
    }

    function toggleCardSelection(id, cardElement) {
        if (selectedUpdateIds.has(id)) {
            selectedUpdateIds.delete(id);
            cardElement.classList.remove('selected');
        } else {
            selectedUpdateIds.add(id);
            cardElement.classList.add('selected');
        }
        updateBulkBar();
    }

    function updateBulkBar() {
        const count = selectedUpdateIds.size;
        selectedCountSpan.textContent = `${count} update${count !== 1 ? 's' : ''} selected`;
        
        if (count > 0) {
            bulkActionBar.classList.add('visible');
        } else {
            bulkActionBar.classList.remove('visible');
        }
    }

    function generateTweetText(update) {
        const title = `BigQuery ${update.type} (${update.date}): `;
        const tags = ` #BigQuery #GoogleCloud`;
        const link = `\nDetails: ${update.link}`;
        
        // 280 character limit
        const maxSnippetLength = 280 - title.length - tags.length - link.length;
        
        let snippet = update.text;
        if (snippet.length > maxSnippetLength) {
            snippet = snippet.substring(0, maxSnippetLength - 3) + "...";
        }
        
        return `${title}${snippet}${link}${tags}`;
    }

    function openTweetComposer(text) {
        tweetTextarea.value = text;
        
        // Update character count
        const count = text.length;
        charCounter.textContent = `${count} / 280`;
        if (count > 280) {
            charCounter.className = 'char-counter danger';
            confirmTweetBtn.disabled = true;
        } else {
            charCounter.className = 'char-counter';
            confirmTweetBtn.disabled = false;
        }
        
        tweetModalOverlay.classList.add('active');
        tweetTextarea.focus();
        document.body.style.overflow = 'hidden'; // Disable page scrolling
    }

    function closeTweetComposer() {
        tweetModalOverlay.classList.remove('active');
        document.body.style.overflow = ''; // Enable page scrolling
    }

    function setLoadingState(isLoading) {
        if (isLoading) {
            refreshBtn.classList.add('loading');
            refreshBtn.disabled = true;
            // Render Skeleton Cards
            updatesList.innerHTML = `
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
            `;
        } else {
            refreshBtn.classList.remove('loading');
            refreshBtn.disabled = false;
        }
    }

    function showErrorState(message) {
        updatesList.innerHTML = `
            <div class="empty-state" style="border-color: var(--color-issue);">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3>Unable to Load Release Notes</h3>
                <p>${message}</p>
                <button class="btn" onclick="location.reload()" style="margin-top: 1rem;">Retry Connection</button>
            </div>
        `;
    }

    function renderEmptyState() {
        updatesList.innerHTML = `
            <div class="empty-state">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3>No updates match your filters</h3>
                <p>Try adjusting your search terms or selecting another category.</p>
            </div>
        `;
    }

    function showToast(message) {
        // Remove existing toast if present
        const oldToast = document.querySelector('.toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>${message}</span>
        `;
        document.body.appendChild(toast);
        
        // Show and hide animation
        setTimeout(() => toast.classList.add('show'), 50);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
});
