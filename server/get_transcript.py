#!/usr/bin/env python3
"""
Extract YouTube transcripts using youtube-transcript-api.
This script bridges the gap for videos without official captions.
"""

import sys
import json
import traceback

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Missing dependency: {str(e)}. Please run: pip install youtube-transcript-api",
        "transcript": ""
    }))
    sys.exit(1)

def get_transcript(video_id):
    try:
        # Initialize API instance
        api = YouTubeTranscriptApi()
        
        # Try to get English transcript first
        try:
            transcript = api.fetch(video_id, languages=['en'])
        except NoTranscriptFound:
            # Fall back to any available language
            transcript_list = api.list(video_id)
            # Try manually created transcripts first
            if transcript_list.manually_created_transcripts:
                transcript = transcript_list.manually_created_transcripts[0].fetch()
            elif transcript_list.generated_transcripts:
                transcript = transcript_list.generated_transcripts[0].fetch()
            else:
                raise NoTranscriptFound(f"No transcripts found for video ID {video_id}")

        # Combine all text entries into a single transcript
        # transcript is a FetchedTranscript object, items have .text attribute
        full_transcript = " ".join([item.text for item in transcript])

        return {
            "success": True,
            "transcript": full_transcript,
            "language": "en",
            "source": "youtube-transcript-api"
        }

    except TranscriptsDisabled:
        return {
            "success": False,
            "error": "Transcripts are disabled for this video",
            "transcript": ""
        }
    except NoTranscriptFound:
        return {
            "success": False,
            "error": "No transcripts available for this video",
            "transcript": ""
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"{type(e).__name__}: {str(e)}",
            "transcript": "",
            "traceback": traceback.format_exc()
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Video ID required"
        }))
        sys.exit(1)

    video_id = sys.argv[1]
    result = get_transcript(video_id)
    print(json.dumps(result))

