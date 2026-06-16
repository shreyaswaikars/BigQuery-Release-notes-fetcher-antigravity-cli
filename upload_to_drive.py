import os
import sys
import google.auth
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

def upload_file(file_path, mime_type=None):
    """
    Uploads a file to Google Drive.
    
    Args:
        file_path (str): The local path of the file to upload.
        mime_type (str, optional): The MIME type of the file. If not provided,
                                   it will be guessed automatically by MediaFileUpload.
                                   
    Returns:
        str: The uploaded file's ID if successful, otherwise None.
    """
    if not os.path.exists(file_path):
        print(f"Error: File not found at path '{file_path}'")
        return None
        
    file_name = os.path.basename(file_path)
    
    # Load pre-authorized user credentials from the environment.
    # To run this successfully, ensure you have set up Application Default Credentials (ADC).
    # Learn more: https://cloud.google.com/docs/authentication/provide-credentials-adc
    try:
        print("Authenticating with Google Cloud...")
        creds, _ = google.auth.default()
        
        # Build the Drive API client (v3)
        service = build('drive', 'v3', credentials=creds)
        
        # Define metadata for the file
        file_metadata = {
            'name': file_name
        }
        
        # Set up the media file upload wrapper
        media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)
        
        print(f"Uploading '{file_name}' to Google Drive...")
        
        # Perform the creation request
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()
        
        file_id = file.get('id')
        print(f"Success! File uploaded successfully.")
        print(f"File ID: {file_id}")
        return file_id
        
    except HttpError as error:
        print(f"An API error occurred: {error}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python upload_to_drive.py <local-file-path> [mime-type]")
        sys.exit(1)
        
    target_file = sys.argv[1]
    target_mime = sys.argv[2] if len(sys.argv) > 2 else None
    
    upload_file(target_file, target_mime)
