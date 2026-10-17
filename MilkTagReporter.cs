/*
 * MilkTagReporter.cs
 * posts player/room counts every so often - lightweight, wont hitch the game
 *
 * set the api url + key below (theyre stored obfuscated)
 * fill in the 3 methods at the bottom for your networking
 */

using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

public class MilkTagReporter : MonoBehaviour
{
    [Range(10f, 120f)]
    public float reportIntervalSeconds = 30f;

    public bool verboseLogging = false;

    // obfuscated - not plain text in the build
    // replace after encoding your real url/key (see context menu below)
    static readonly byte[] _urlEnc = Convert.FromBase64String(
        "aHR0cHM6Ly9ZT1VSLVBST0pFQ1QuZXhhbXBsZS5jb20vYXBpL3N0YXRz"
    );
    static readonly byte[] _keyEnc = Convert.FromBase64String(
        "bWlsay1zZWNyZXQta2V5LWNoYW5nZS1tZQ=="
    );

    private int _lastKnownPlayerCount;
    private int _pendingNewJoins;
    private bool _requestInFlight;
    private string _url;
    private string _key;

    private void Awake()
    {
        _url = Encoding.UTF8.GetString(_urlEnc);
        _key = Encoding.UTF8.GetString(_keyEnc);
    }

    private void Start()
    {
        StartCoroutine(ReportLoop());
    }

    private IEnumerator ReportLoop()
    {
        yield return new WaitForSeconds(3f);

        var wait = new WaitForSeconds(reportIntervalSeconds);

        while (true)
        {
            if (!_requestInFlight)
                StartCoroutine(SendReport());

            yield return wait;
        }
    }

    private IEnumerator SendReport()
    {
        if (_requestInFlight) yield break;
        _requestInFlight = true;

        int sessions = 0, inRooms = 0, liveRooms = 0;

        try
        {
            sessions  = GetCurrentOnlinePlayers();
            inRooms   = GetPlayersCurrentlyInRooms();
            liveRooms = GetLiveRoomCount();
        }
        catch (Exception e)
        {
            if (verboseLogging)
                Debug.LogWarning($"[milk] count error: {e.Message}");
            _requestInFlight = false;
            yield break;
        }

        if (sessions > _lastKnownPlayerCount)
            _pendingNewJoins += sessions - _lastKnownPlayerCount;
        _lastKnownPlayerCount = sessions;

        var sb = new StringBuilder(96);
        sb.Append("{\"sessions\":").Append(sessions)
          .Append(",\"in_rooms\":").Append(inRooms)
          .Append(",\"live_rooms\":").Append(liveRooms)
          .Append(",\"new_joins\":").Append(_pendingNewJoins)
          .Append('}');
        _pendingNewJoins = 0;

        byte[] body = Encoding.UTF8.GetBytes(sb.ToString());

        using (var req = new UnityWebRequest(_url, "POST"))
        {
            req.uploadHandler   = new UploadHandlerRaw(body);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            req.SetRequestHeader("X-Api-Key", _key);
            req.timeout = 6;

            yield return req.SendWebRequest();

#if UNITY_2020_2_OR_NEWER
            bool ok = req.result == UnityWebRequest.Result.Success;
#else
            bool ok = !req.isNetworkError && !req.isHttpError;
#endif

            if (verboseLogging)
            {
                if (ok) Debug.Log($"[milk] ok s={sessions} r={liveRooms}");
                else Debug.LogWarning($"[milk] fail {req.responseCode}");
            }
        }

        _requestInFlight = false;
    }

    // keep these FAST

    private int GetCurrentOnlinePlayers()
    {
        // Photon PUN 2:
        // return Photon.Pun.PhotonNetwork.CountOfPlayers;

        // demo:
        return UnityEngine.Random.Range(30, 55);
    }

    private int GetPlayersCurrentlyInRooms()
    {
        return Mathf.Max(0, GetCurrentOnlinePlayers() - UnityEngine.Random.Range(0, 8));
    }

    private int GetLiveRoomCount()
    {
        // Photon:
        // return PhotonNetwork.CountOfRooms;

        return UnityEngine.Random.Range(6, 14);
    }

#if UNITY_EDITOR
    [ContextMenu("Encode URL + Key")]
    private void EncodeDebug()
    {
        // put your REAL values here, right-click component → Encode URL + Key
        string realUrl = "https://YOUR-PROJECT.vercel.app/api/stats";
        string realKey = "milk-secret-key-change-me";

        string urlB64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(realUrl));
        string keyB64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(realKey));
        Debug.Log($"URL Base64:\n{urlB64}");
        Debug.Log($"Key Base64:\n{keyB64}");
        // paste those into the static readonly byte[] fields above
    }
#endif
}
