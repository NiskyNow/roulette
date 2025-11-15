def commit_callback(commit):
    if commit.author_name == "HonNouJuku":
        commit.skip()