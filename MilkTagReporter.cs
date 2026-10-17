using System.Collections;
using System.Text;
using Photon.Pun;
using UnityEngine;
using UnityEngine.Networking;

public class MilkTagReporter : MonoBehaviourPunCallbacks
{
    [SerializeField, Range(10f, 120f)] private float reportInterval = 30f;
    [SerializeField] private bool showJoinTime = true;

    private const string StatsUrl = "https://YOUR-PROJECT.vercel.app/api/stats";
    private const string ApiKey = "CHANGE-THIS-KEY";

    private bool sending;
    private int previousPlayerCount;
    private int pendingJoins;
    private bool joinTimerRunning;
    private float joinStartedAt;
    private float lastJoinSeconds = -1f;

    private void Start()
    {
        StartCoroutine(ReportLoop());
    }

    // Call this immediately before PhotonNetwork.JoinRoom or JoinRandomRoom.
    public void BeginLobbyJoinTimer()
    {
        joinStartedAt = Time.realtimeSinceStartup;
        joinTimerRunning = true;
    }

    public override void OnJoinedRoom()
    {
        if (!joinTimerRunning)
            return;

        lastJoinSeconds = Mathf.Max(0f, Time.realtimeSinceStartup - joinStartedAt);
        joinTimerRunning = false;
    }

    public override void OnJoinRoomFailed(short returnCode, string message)
    {
        joinTimerRunning = false;
    }

    public override void OnJoinRandomFailed(short returnCode, string message)
    {
        joinTimerRunning = false;
    }

    private void OnGUI()
    {
        if (!showJoinTime || (!joinTimerRunning && lastJoinSeconds < 0f))
            return;

        string value = joinTimerRunning
            ? (Time.realtimeSinceStartup - joinStartedAt).ToString("F2") + " s"
            : lastJoinSeconds.ToString("F2") + " s";

        GUI.Label(new Rect(12f, 12f, 280f, 30f), "Lobby join time: " + value);
    }

    private IEnumerator ReportLoop()
    {
        yield return new WaitForSeconds(3f);

        while (enabled)
        {
            if (!sending)
                yield return SendReport();

            yield return new WaitForSeconds(Mathf.Clamp(reportInterval, 10f, 120f));
        }
    }

    private IEnumerator SendReport()
    {
        sending = true;

        int players = Mathf.Max(0, PhotonNetwork.CountOfPlayers);
        int playersInRooms = Mathf.Max(0, PhotonNetwork.CountOfPlayersInRooms);
        int rooms = Mathf.Max(0, PhotonNetwork.CountOfRooms);

        if (players > previousPlayerCount)
            pendingJoins += players - previousPlayerCount;

        previousPlayerCount = players;

        string json = string.Format(
            "{{\"sessions\":{0},\"in_rooms\":{1},\"live_rooms\":{2},\"new_joins\":{3}}}",
            players, playersInRooms, rooms, pendingJoins);

        using (var request = new UnityWebRequest(StatsUrl, "POST"))
        {
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("X-Api-Key", ApiKey);
            request.timeout = 8;

            yield return request.SendWebRequest();

#if UNITY_2020_2_OR_NEWER
            bool succeeded = request.result == UnityWebRequest.Result.Success;
#else
            bool succeeded = !request.isNetworkError && !request.isHttpError;
#endif

            if (succeeded)
                pendingJoins = 0;
        }

        sending = false;
    }
}
