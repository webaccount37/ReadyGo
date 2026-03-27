"""Unit tests for SharePoint folder name helpers."""

from app.core.integrations.sharepoint_graph import (
    SharePointGraphAppClient,
    compute_quick_launch_sort_order,
    folder_names_match,
    quick_launch_node_title,
    sanitize_sharepoint_folder_name,
)


def test_sanitize_strips_invalid_chars() -> None:
    assert sanitize_sharepoint_folder_name('  A/B:C*D  ') == "A B C D"


def test_sanitize_empty_becomes_untitled() -> None:
    assert sanitize_sharepoint_folder_name("   ") == "Untitled"
    assert sanitize_sharepoint_folder_name("///") == "Untitled"


def test_folder_names_match_case_insensitive() -> None:
    assert folder_names_match("SRS Distribution", "srs distribution")
    assert folder_names_match("SRS  Distribution", "SRS Distribution")


def test_folder_names_match_after_sanitize() -> None:
    assert folder_names_match("Proj:A", "Proj A")


def test_quicklaunch_site_home_must_not_mask_library_under_site() -> None:
    """Regression: parent-path matching made every library \"already in nav\" when Home linked the site root."""
    library = (
        "https://readymanagementsolutions.sharepoint.com/sites/ActiveProjects/"
        "Internal%20Projects%20(US)"
    )
    nodes = [
        {
            "Title": "Home",
            "Url": "https://readymanagementsolutions.sharepoint.com/sites/ActiveProjects",
        },
    ]
    assert SharePointGraphAppClient._quicklaunch_has_link_to_library(nodes, library) is False


def test_quicklaunch_exact_library_url_matches() -> None:
    library = "https://tenant.sharepoint.com/sites/S/MyLib"
    nodes = [{"Title": "MyLib", "Url": library}]
    assert SharePointGraphAppClient._quicklaunch_has_link_to_library(nodes, library) is True


def test_quicklaunch_allitems_view_matches_library_weburl() -> None:
    library = "https://tenant.sharepoint.com/sites/S/MyLib"
    nodes = [
        {
            "Title": "MyLib",
            "Url": "https://tenant.sharepoint.com/sites/S/MyLib/Forms/AllItems.aspx",
        }
    ]
    assert SharePointGraphAppClient._quicklaunch_has_link_to_library(nodes, library) is True


def test_quick_launch_sort_order_home_alphabetical_recycle_last() -> None:
    nodes = [
        {"Id": 1, "Title": "Zebra", "Url": "/a/z"},
        {"Id": 2, "Title": "Home", "Url": "/"},
        {"Id": 3, "Title": "Recycle Bin", "Url": "/recycle"},
        {"Id": 4, "Title": "Apple", "Url": "/a"},
    ]
    out = compute_quick_launch_sort_order(nodes)
    assert [quick_launch_node_title(n) for n in out] == [
        "Home",
        "Apple",
        "Zebra",
        "Recycle Bin",
    ]


def test_quick_launch_sort_edit_pinned_last_with_alpha_middle() -> None:
    nodes = [
        {"Id": 1, "Title": "Beta", "Url": "/b"},
        {"Id": 2, "Title": "Edit", "Url": "/edit"},
        {"Id": 3, "Title": "Alpha", "Url": "/a"},
        {"Id": 4, "Title": "Home", "Url": "/"},
    ]
    out = compute_quick_launch_sort_order(nodes)
    titles = [quick_launch_node_title(n) for n in out]
    assert titles[0] == "Home"
    assert titles[-1] == "Edit"
    assert titles[1:-1] == ["Alpha", "Beta"]
