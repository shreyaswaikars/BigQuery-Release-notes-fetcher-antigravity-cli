import time
import requests
import xml.etree.ElementTree as ET
import re
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_DURATION = 300  # Cache for 5 minutes

def fetch_and_parse_feed():
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
    except Exception as e:
        return {"error": f"Failed to fetch feed: {str(e)}"}
    
    try:
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        root = ET.fromstring(response.content)
        
        updates = []
        for index, entry in enumerate(root.findall('atom:entry', ns)):
            date_str = entry.find('atom:title', ns).text
            updated = entry.find('atom:updated', ns).text
            
            link_elem = entry.find('atom:link[@rel="alternate"]', ns)
            entry_link = link_elem.get('href') if link_elem is not None else ''
            if not entry_link:
                entry_link = "https://cloud.google.com/bigquery/docs/release-notes"
                
            content_elem = entry.find('atom:content', ns)
            content_html = content_elem.text if content_elem is not None else ''
            
            # Split content into individual updates by <h3> tags
            parts = re.split(r'<h3>', content_html)
            
            # If the content didn't start with <h3> or split didn't find any, handle it
            sub_index = 0
            for part in parts:
                if not part.strip():
                    continue
                
                # Each update needs a unique ID
                update_id = f"up-{index}-{sub_index}"
                sub_index += 1
                
                if '</h3>' in part:
                    update_type, html_content = part.split('</h3>', 1)
                    update_type = update_type.strip()
                    
                    # Create a clean text preview for search and tweeting
                    clean_text = re.sub(r'<[^>]+>', '', html_content)
                    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                    
                    updates.append({
                        'id': update_id,
                        'date': date_str,
                        'type': update_type,
                        'html': html_content.strip(),
                        'text': clean_text,
                        'link': entry_link
                    })
                else:
                    clean_text = re.sub(r'<[^>]+>', '', part)
                    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                    updates.append({
                        'id': update_id,
                        'date': date_str,
                        'type': 'General',
                        'html': part.strip(),
                        'text': clean_text,
                        'link': entry_link
                    })
        return {"updates": updates}
    except Exception as e:
        return {"error": f"Failed to parse feed: {str(e)}"}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/updates')
def get_updates():
    force_refresh = request.args.get('force', 'false').lower() == 'true'
    now = time.time()
    
    if force_refresh or not cache["data"] or (now - cache["last_fetched"] > CACHE_DURATION):
        result = fetch_and_parse_feed()
        if "error" not in result:
            cache["data"] = result["updates"]
            cache["last_fetched"] = now
        else:
            if cache["data"]:
                return jsonify({"updates": cache["data"], "warning": result["error"]})
            return jsonify(result), 500
            
    return jsonify({"updates": cache["data"]})

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
