"""
rag/rag_pipeline.py
-------------------
RAG pipeline for the medical triage system.
Uses BM25 keyword retrieval — pure Python, no ML dependencies.
"""

import os
import logging
from typing import Optional

from langchain_core.documents import Document
from langchain_community.retrievers import BM25Retriever
from langchain_text_splitters import RecursiveCharacterTextSplitter

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from knowledge_base.medical_guidelines import MEDICAL_DOCUMENTS

logger = logging.getLogger(__name__)

TOP_K_RESULTS = int(os.environ.get("RAG_TOP_K", "4"))


def _build_documents() -> list[Document]:
    """Convert raw knowledge-base dicts into LangChain Document objects."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100,
        separators=["\n\n", "\n", ".", " "],
    )
    docs: list[Document] = []
    for entry in MEDICAL_DOCUMENTS:
        chunks = splitter.split_text(entry["content"].strip())
        for i, chunk in enumerate(chunks):
            docs.append(
                Document(
                    page_content=chunk,
                    metadata={
                        "source_id": entry["id"],
                        "title":     entry["title"],
                        "category":  entry["category"],
                        "chunk":     i,
                    },
                )
            )
    logger.info(f"Built {len(docs)} document chunks from {len(MEDICAL_DOCUMENTS)} source documents.")
    return docs


class MedicalRAGPipeline:
    """
    Wraps a BM25 retriever built from the medical knowledge base.

    Usage:
        pipeline = MedicalRAGPipeline()
        pipeline.build_or_load()
        retriever = pipeline.get_retriever()
        docs = retriever.invoke("chest pain with sweating")
    """

    def __init__(self):
        self._retriever: Optional[BM25Retriever] = None

    def build_or_load(self, force_rebuild: bool = False) -> None:
        """Build the BM25 index from the knowledge base (instantaneous for small corpora)."""
        docs = _build_documents()
        self._retriever = BM25Retriever.from_documents(docs, k=TOP_K_RESULTS)
        logger.info(f"BM25 retriever ready ({len(docs)} chunks).")

    def get_retriever(self) -> BM25Retriever:
        if self._retriever is None:
            raise RuntimeError("Call build_or_load() before get_retriever().")
        return self._retriever

    def add_documents(self, new_docs: list[dict]) -> None:
        """Rebuild the index with additional documents appended."""
        if self._retriever is None:
            raise RuntimeError("Call build_or_load() first.")
        splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
        new_lc_docs: list[Document] = []
        for entry in new_docs:
            for i, chunk in enumerate(splitter.split_text(entry["content"])):
                new_lc_docs.append(
                    Document(
                        page_content=chunk,
                        metadata={
                            "source_id": entry["id"],
                            "title":     entry["title"],
                            "category":  entry.get("category", "general"),
                            "chunk":     i,
                        },
                    )
                )
        existing = self._retriever.docs
        self._retriever = BM25Retriever.from_documents(existing + new_lc_docs, k=TOP_K_RESULTS)
        logger.info(f"Added {len(new_lc_docs)} chunks; index rebuilt.")
